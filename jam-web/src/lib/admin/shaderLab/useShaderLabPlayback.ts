'use client'

/**
 * 쉐이더 랩 — 재생/정지 가능한 캔버스 렌더 루프 (티켓 20260912_1951, RAF 레이스 컨디션
 * 수정 20260912_2157)
 *
 * `@basementstudio/shader-lab`가 공개하는 최상위 컴포넌트 `ShaderLabComposition`은 내부에서
 * 자체 requestAnimationFrame 루프를 돌리며 항상 실시간(wall clock)으로만 그린다 — 정지(pause)
 * 기능이 없고, `config` 참조가 바뀔 때마다 렌더러를 통째로 새로 만든다(원본 소스 확인 결과,
 * `shader-lab-composition.js`의 `useEffect` 의존성 배열이 `[config, ...]`). 슬라이더를 드래그할
 * 때마다 매 프레임 렌더러가 재생성되는 건 이 에디터 용도에 맞지 않는다.
 *
 * 대신 "Advanced API"로 공개된 `useShaderLabCanvasSource`(공개 export, 내부 renderer 모듈
 * 직접 참조 아님)를 쓴다 — 이 훅은 `config`가 바뀌어도 렌더러를 재생성하지 않고
 * `source.setConfig()`만 호출한다(패키지 소스 `use-shader-lab-canvas-source.js` 확인). 시간
 * 진행은 이 훅을 부르는 쪽이 직접 requestAnimationFrame으로 제어하므로, "정지" 상태에서는
 * delta를 누적하지 않고 동일한 `time`으로만 다시 그려 애니메이션 시간축을 진짜로 멈춘다(GPU
 * 렌더 자체는 계속 돌아 파라미터 편집은 실시간으로 반영됨 — WYSIWYG 요구사항 때문에 렌더
 * 루프 자체를 멈추지는 않는다).
 *
 * 결과적으로 1차 범위(키프레임 없는 재생/정지)는 패키지 공개 API만으로 구현 가능함을
 * 확인했다 — `packages/shader-lab-react/src/renderer/*` 내부 모듈 이식은 필요 없었다.
 *
 * 출처: https://github.com/basementstudio/shader-lab (Apache License 2.0)
 * 이식 시점: 2026-09-12, npm `@basementstudio/shader-lab@3.0.2`
 */
import { useEffect, useRef } from 'react'
import { useShaderLabCanvasSource, type ShaderLabConfig } from '@basementstudio/shader-lab'

interface UseShaderLabPlaybackOptions {
  canvas: HTMLCanvasElement | null
  playing: boolean
}

export interface UseShaderLabPlaybackResult {
  ready: boolean
}

export function useShaderLabPlayback(
  config: ShaderLabConfig,
  { canvas, playing }: UseShaderLabPlaybackOptions
): UseShaderLabPlaybackResult {
  const { ready, update } = useShaderLabCanvasSource(config, canvas ? { canvas } : undefined)

  const timeRef = useRef(0)
  const lastFrameRef = useRef<number | null>(null)
  const playingRef = useRef(playing)
  const readyRef = useRef(ready)

  // 렌더 중 ref를 직접 대입하지 않는다(react-hooks/refs) — 최신 `playing`/`ready` 값은 별도
  // effect에서 ref에 반영하고, 아래 RAF 루프는 그 ref만 읽는다.
  useEffect(() => {
    playingRef.current = playing
  }, [playing])

  useEffect(() => {
    readyRef.current = ready
  }, [ready])

  useEffect(() => {
    if (!canvas) return
    let frameId = 0
    let cancelled = false

    // 티켓 20260912_2157 — 프로덕션 활성 버그 수정.
    // WebGPU 백엔드 초기화(`useShaderLabCanvasSource` 내부, 비동기)가 이 effect가 첫
    // requestAnimationFrame을 예약하는 시점보다 늦게 끝나면, 예전 코드는 `ready`를 확인하지
    // 않고 매 프레임 `update()`를 호출해 "Renderer: .render() called before the backend is
    // initialized." 예외를 던졌다. 예외가 `loop` 함수 안에서 그대로 전파되면 그 아래
    // `requestAnimationFrame(loop)` 재예약 줄이 실행되지 않아 루프 자체가 영구히 멈췄다
    // (레이어를 추가하거나 이미지를 올려도 캔버스가 다시는 그려지지 않음 — 실사용자 프로덕션
    // 장애 확인됨, `dpl_CdouLWFVzmz2ocefRgWFhMdbJ32N` 배포).
    //
    // 수정: (1) 다음 프레임 예약(`requestAnimationFrame(loop)`)을 가장 먼저 실행해 아래에서
    // 무슨 일이 벌어지든(예외 포함) 루프가 끊기지 않도록 순서를 보장하고, (2) `ready`가 아닐
    // 때는 `update()` 호출 자체를 건너뛰며, (3) 혹시 모를 다른 런타임 예외(리사이즈 중 일시적
    // 컨텍스트 문제 등)에도 루프가 죽지 않도록 `update()` 호출을 try/catch로 감싼다 — 에러는
    // 로그만 남기고 다음 프레임으로 계속 진행한다.
    const loop = (now: number) => {
      if (cancelled) return
      frameId = window.requestAnimationFrame(loop)

      const previous = lastFrameRef.current ?? now
      const delta = Math.max(0, (now - previous) / 1000)
      lastFrameRef.current = now

      if (!readyRef.current) return

      if (playingRef.current) {
        timeRef.current += delta
      }
      try {
        update(timeRef.current, playingRef.current ? delta : 0)
      } catch (error) {
        console.error('[shader-lab] 프레임 렌더링 중 오류가 발생했지만 재생 루프는 계속돼요.', error)
      }
    }

    frameId = window.requestAnimationFrame(loop)
    return () => {
      cancelled = true
      lastFrameRef.current = null
      window.cancelAnimationFrame(frameId)
    }
  }, [canvas, update])

  return { ready }
}

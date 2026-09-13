'use client'

/**
 * 쉐이더 랩 — 캔버스 렌더 루프 (티켓 20260912_1951, RAF 레이스 컨디션 수정 20260912_2157,
 * 재생/정지 기능 제거 20260913_1819)
 *
 * `@basementstudio/shader-lab`가 공개하는 최상위 컴포넌트 `ShaderLabComposition`은 내부에서
 * 자체 requestAnimationFrame 루프를 돌리며 항상 실시간(wall clock)으로만 그린다 —
 * `config` 참조가 바뀔 때마다 렌더러를 통째로 새로 만든다(원본 소스 확인 결과,
 * `shader-lab-composition.js`의 `useEffect` 의존성 배열이 `[config, ...]`). 슬라이더를 드래그할
 * 때마다 매 프레임 렌더러가 재생성되는 건 이 에디터 용도에 맞지 않는다.
 *
 * 대신 "Advanced API"로 공개된 `useShaderLabCanvasSource`(공개 export, 내부 renderer 모듈
 * 직접 참조 아님)를 쓴다 — 이 훅은 `config`가 바뀌어도 렌더러를 재생성하지 않고
 * `source.setConfig()`만 호출한다(패키지 소스 `use-shader-lab-canvas-source.js` 확인).
 *
 * 티켓 20260913_1819 — 재생/정지 스위치를 완전히 제거했다. 이 도구의 산출물은 1:1 정적
 * PNG라 "재생" 개념 자체가 불필요하고, 대신 시간이 지나면 스스로 움직이던 6개 레이어의
 * "애니메이션" 파라미터를 `effectRegistry.ts`에서 없앴다(항상 정지된 값으로 고정). 시간
 * (delta)은 **항상 실제 경과 시간만큼 흐르게** 유지한다 — 플루이드 소스(`fluid-pass.js`)가
 * `render()`에서 `this.runtime.step(delta)`로 포인터 스플랫의 물리(감쇠·이류)를 델타
 * 타임 기반으로 진행시키므로, delta를 0으로 고정하면 마우스 반응(사용자가 유지를 요청한
 * 부분)까지 함께 멈춘다. 픽셀 트레일·매그니파이 렌즈도 포인터 위치 기반이라 시간이 계속
 * 흘러도 문제없다(패키지의 `needsContinuousRender()`가 이 셋은 시간과 무관하게 항상
 * `true`임을 확인함).
 *
 * 결과적으로 1차 범위(키프레임 없는 렌더 루프)는 패키지 공개 API만으로 구현 가능함을
 * 확인했다 — `packages/shader-lab-react/src/renderer/*` 내부 모듈 이식은 필요 없었다.
 *
 * 출처: https://github.com/basementstudio/shader-lab (Apache License 2.0)
 * 이식 시점: 2026-09-12, npm `@basementstudio/shader-lab@3.0.2`
 */
import { useEffect, useRef } from 'react'
import { useShaderLabCanvasSource, type ShaderLabConfig } from '@basementstudio/shader-lab'

interface UseShaderLabPlaybackOptions {
  canvas: HTMLCanvasElement | null
}

export interface UseShaderLabPlaybackResult {
  ready: boolean
}

export function useShaderLabPlayback(
  config: ShaderLabConfig,
  { canvas }: UseShaderLabPlaybackOptions
): UseShaderLabPlaybackResult {
  const { ready, update } = useShaderLabCanvasSource(config, canvas ? { canvas } : undefined)

  const timeRef = useRef(0)
  const lastFrameRef = useRef<number | null>(null)
  const readyRef = useRef(ready)

  // 렌더 중 ref를 직접 대입하지 않는다(react-hooks/refs) — 최신 `ready` 값은 별도
  // effect에서 ref에 반영하고, 아래 RAF 루프는 그 ref만 읽는다.
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
    // `requestAnimationFrame(loop)` 재예약 줄이 실행되지 않아 루프 자체가 영구히 멈췄다.
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

      timeRef.current += delta
      try {
        update(timeRef.current, delta)
      } catch (error) {
        console.error('[shader-lab] 프레임 렌더링 중 오류가 발생했지만 렌더 루프는 계속 돌아가요.', error)
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

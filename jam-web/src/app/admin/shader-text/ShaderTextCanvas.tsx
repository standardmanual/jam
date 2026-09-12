'use client'

import { useEffect, useRef, type RefObject } from 'react'
import { CANVAS_SIZE, SHADER_TEXT_PHASE_RATE, type ShaderTextParams } from '@/lib/admin/shaderTextDissolve'
import { drawShaderTextDissolve, ensureShaderTextFonts } from '@/lib/admin/composeShaderTextDissolve'

interface ShaderTextCanvasProps {
  params: ShaderTextParams
  /** 실루엣 이미지 사용 시의 소스 이미지. 파라미터엔 저장되지 않는 휘발성 값이다. */
  silhouetteImage: HTMLImageElement | null
  /** `background.mode === 'image'`일 때의 배경 이미지. 실루엣과 동일하게 휘발성 값이다. */
  backgroundImage: HTMLImageElement | null
  /** 재생 중이면 rAF로 위상을 누적하며 계속 다시 그린다. */
  playing: boolean
  /**
   * 지금 누적 중인 위상이 어느 선택(배지·프리셋 불러오기 등)에 속하는지 나타내는 토큰.
   * `20260902_1613`의 `selectionKey` 패턴과 동일 — 재생 중 다른 배지를 고르면 React가 rAF
   * 정리 함수를 새 effect보다 먼저 돌려, 이전 선택의 누적 위상이 이미 교체된 draft를 덮어쓰는
   * 사고를 막는다.
   */
  selectionKey: number
  /** 재생이 멈출 때(일시정지·언마운트) 그 시점의 누적 위상을 올려 준다. */
  onPause: (phase: number, selectionKey: number) => void
  canvasRef: RefObject<HTMLCanvasElement | null>
}

/**
 * 쉐이더 텍스트(디졸브 에코) 미리보기 — **굽는 캔버스 그 자체** (티켓 20260912_1532)
 *
 * 별도 미리보기 렌더러를 두지 않는다. 화면에 보이는 이 캔버스를 그대로 `toBlob()`으로 구우므로
 * WYSIWYG가 구조적으로 보장된다(`20260819_011/014`, `20260902_1613`과 동일 원칙).
 */
export default function ShaderTextCanvas({
  params,
  silhouetteImage,
  backgroundImage,
  playing,
  selectionKey,
  onPause,
  canvasRef,
}: ShaderTextCanvasProps) {
  const paramsRef = useRef(params)
  const silhouetteRef = useRef(silhouetteImage)
  const backgroundImageRef = useRef(backgroundImage)
  const onPauseRef = useRef(onPause)
  const phaseRef = useRef(params.animation.bakedPhase)
  const fontsReadyRef = useRef<{ weight: number; size: number } | null>(null)

  useEffect(() => {
    paramsRef.current = params
    silhouetteRef.current = silhouetteImage
    backgroundImageRef.current = backgroundImage
    onPauseRef.current = onPause
  })

  async function ensureFonts(p: ShaderTextParams) {
    const key = fontsReadyRef.current
    if (key && key.weight === p.font.weight && key.size === p.font.size) return
    await ensureShaderTextFonts(p.font.weight, p.font.size)
    fontsReadyRef.current = { weight: p.font.weight, size: p.font.size }
  }

  // 정지 상태 — 파라미터가 바뀔 때마다 한 번씩만 다시 그린다.
  useEffect(() => {
    if (playing) return
    const canvas = canvasRef.current
    if (!canvas) return
    phaseRef.current = params.animation.bakedPhase
    let cancelled = false
    void ensureFonts(params).then(() => {
      if (cancelled || !canvasRef.current) return
      drawShaderTextDissolve(canvasRef.current, params, silhouetteImage, backgroundImage)
    })
    return () => {
      cancelled = true
    }
  }, [params, silhouetteImage, backgroundImage, playing, canvasRef])

  // 재생 루프. 언마운트·일시정지 시 rAF를 반드시 해제하고 누적 위상을 확정한다.
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    let stopped = false

    const loop = (now: number) => {
      if (stopped) return
      const dt = Math.min((now - last) / 1000, 0.25) // 탭 비활성 복귀 시 위상이 튀지 않게 상한
      last = now
      const current = paramsRef.current
      phaseRef.current += SHADER_TEXT_PHASE_RATE * current.animation.speed * dt
      const canvas = canvasRef.current
      if (canvas) {
        drawShaderTextDissolve(
          canvas,
          { ...current, animation: { ...current.animation, bakedPhase: phaseRef.current } },
          silhouetteRef.current,
          backgroundImageRef.current
        )
      }
      raf = requestAnimationFrame(loop)
    }

    const start = () => {
      last = performance.now()
      raf = requestAnimationFrame(loop)
    }
    void ensureFonts(paramsRef.current).then(() => {
      if (!stopped) start()
    })

    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      // `selectionKey`는 이 effect가 만들어진 렌더의 값이다(클로저로 붙잡는다) — 정리 시점의
      // ref를 읽으면 이미 새 선택 값으로 바뀐 뒤라 낡은 갱신을 가려낼 수 없다.
      onPauseRef.current(phaseRef.current, selectionKey)
    }
  }, [playing, selectionKey, canvasRef])

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_SIZE}
      height={CANVAS_SIZE}
      // 백킹 스토어는 1280이고 화면 표시만 축소한다 — 미리보기와 결과물이 같은 픽셀이다.
      className="w-full max-w-[480px] h-auto rounded-xl"
      // 투명 배경이면 체커보드처럼 비어 보인다. 어떤 배경 위에 놓이는지 감이 오도록 미리보기에서만
      // 서비스 카드 배경색과 비슷한 톤을 깔아 준다(합성 결과에는 영향 없음 — CSS 배경일 뿐).
      style={{
        backgroundColor: '#1f1f1f',
        backgroundImage:
          'repeating-conic-gradient(#2a2a2a 0% 25%, #1f1f1f 0% 50%) 50% / 24px 24px',
      }}
    />
  )
}

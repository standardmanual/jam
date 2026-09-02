'use client'

import { useEffect, useRef, type RefObject } from 'react'
import { BLOB_PHASE_RATE } from '@/lib/blobAnimation'
import { OUTPUT_SIZE, type ActivityBadgeImageParams } from '@/lib/admin/activityBadgeImage'
import { drawActivityBadgeImage, ensureBadgeImageFonts } from '@/lib/admin/composeActivityBadgeImage'

interface ActivityBadgeImageCanvasProps {
  params: ActivityBadgeImageParams
  /** 재생 중이면 rAF로 위상을 누적하며 계속 다시 그린다. */
  playing: boolean
  /** 재생이 멈출 때(일시정지·언마운트) 그 시점의 누적 위상을 올려 준다. 저장 대상 값이다. */
  onPause: (phase: number) => void
  canvasRef: RefObject<HTMLCanvasElement | null>
}

/**
 * 액티비티 배지 이미지 미리보기 — **굽는 캔버스 그 자체** (티켓 20260902_1613)
 *
 * 별도의 미리보기 렌더러를 만들지 않는다. 화면에 보이는 이 캔버스를 그대로 `toBlob()`으로
 * 구우므로 WYSIWYG가 구조적으로 보장된다(20260819_011/014에서 확립한 원칙). 그래서 백킹 스토어는
 * 항상 출력 해상도(1080)이고, 화면에서는 CSS로 축소해 보여준다.
 *
 * 위상(phase) 관리:
 * - 재생 중에는 매 프레임 상태를 올리지 않는다(초당 60회 리렌더를 피한다). ref에만 누적하고
 *   **일시정지하는 순간** 한 번 `onPause`로 올려 저장 대상 값으로 확정한다.
 * - 누적은 `phase += BLOB_PHASE_RATE * speed * dt`다. `drawBlobFrame`의 `t`는 경과 시간이 아니라
 *   위상이라, 누적을 호출부가 맡아야 속도를 바꿔도 이미 지나온 위상이 재스케일되지 않는다
 *   (20260902_0629).
 */
export default function ActivityBadgeImageCanvas({
  params,
  playing,
  onPause,
  canvasRef,
}: ActivityBadgeImageCanvasProps) {
  // 렌더 루프가 항상 최신 파라미터를 읽도록 ref에 담아 둔다(파라미터가 바뀔 때마다 rAF 루프를
  // 재시작하면 프레임이 튄다). 렌더 중에 ref를 쓰면 안 되므로 커밋 이후 effect에서 동기화한다.
  const paramsRef = useRef(params)
  const onPauseRef = useRef(onPause)
  const phaseRef = useRef(params.background.phase)
  const fontsReadyRef = useRef(false)

  useEffect(() => {
    paramsRef.current = params
    onPauseRef.current = onPause
  })

  // 정지 상태에서는 파라미터가 바뀔 때마다 한 번씩만 다시 그린다.
  useEffect(() => {
    if (playing) return
    const canvas = canvasRef.current
    if (!canvas) return
    phaseRef.current = params.background.phase
    let cancelled = false
    const draw = () => {
      if (cancelled || !canvasRef.current) return
      drawActivityBadgeImage(canvasRef.current, params)
    }
    if (fontsReadyRef.current) {
      draw()
    } else {
      // 폰트가 로드되기 전에 그리면 폴백 폰트로 구워진다 — 첫 그리기 전에 한 번 기다린다.
      void ensureBadgeImageFonts().then(() => {
        fontsReadyRef.current = true
        draw()
      })
    }
    return () => {
      cancelled = true
    }
  }, [params, playing, canvasRef])

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
      phaseRef.current += BLOB_PHASE_RATE * current.background.speed * dt
      const canvas = canvasRef.current
      if (canvas) {
        drawActivityBadgeImage(canvas, {
          ...current,
          background: { ...current.background, phase: phaseRef.current },
        })
      }
      raf = requestAnimationFrame(loop)
    }

    const start = () => {
      last = performance.now()
      raf = requestAnimationFrame(loop)
    }
    if (fontsReadyRef.current) {
      start()
    } else {
      void ensureBadgeImageFonts().then(() => {
        fontsReadyRef.current = true
        if (!stopped) start()
      })
    }

    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      onPauseRef.current(phaseRef.current)
    }
  }, [playing, canvasRef])

  return (
    <canvas
      ref={canvasRef}
      width={OUTPUT_SIZE}
      height={OUTPUT_SIZE}
      // 백킹 스토어는 1080이고 화면 표시만 축소한다 — 미리보기와 결과물이 같은 픽셀이다.
      className="w-full max-w-[420px] h-auto rounded-xl"
      // 라운드 밖은 투명 PNG라 체커보드처럼 비어 보인다. 어떤 배경 위에 놓이는지 감이 오도록
      // 미리보기에서만 서비스 카드 배경색(--color-surface-elevated)을 깔아 준다.
      style={{ backgroundColor: '#1f1f1f' }}
    />
  )
}

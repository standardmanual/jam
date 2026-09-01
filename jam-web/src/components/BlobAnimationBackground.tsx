'use client'

import { useEffect, useRef } from 'react'
import { drawBlobFrame, type BlobAnimationParams } from '@/lib/blobAnimation'

interface BlobAnimationBackgroundProps {
  params: BlobAnimationParams
  /** 추가 클래스. 기본은 부모(정사각 Hero 카드) 전체를 덮는 절대배치 레이어다. */
  className?: string
}

/** 저사양(모바일) 판정 — 참조 스크립트와 동일하게 coarse 포인터를 기준으로 삼는다. */
function isCoarsePointer(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
}

/**
 * 배지·컬렉션 상세화면의 정사각형 이미지 카드 **안**에 깔리는 블롭 애니메이션 배경.
 * — [20260901_1944]
 *
 * 상세화면 전체를 덮는 고정 배경 레이어(`getBadgeBackgroundStyle`)와는 별개의 렌더링 지점이다.
 * 이미지는 이 캔버스 위(z-10)에 그대로 남고, 카드의 `overflow-hidden` + 라운드가 애니메이션을
 * 카드 모양 안에 가둔다.
 *
 * 성능 가드(티켓 필수 요구사항) — `ctx.filter`의 blur를 매 프레임 6회 호출하므로 모바일 비용이
 * 크다. 아래를 모두 적용한다:
 * - `prefers-reduced-motion: reduce`면 루프를 돌리지 않고 **정지 1프레임만** 그린다. 배경을 통째로
 *   숨기면(기존 `.badge-background-video`의 display:none 방식) 카드가 비어 보이므로 정지 프레임을
 *   유지한다.
 * - `IntersectionObserver`로 카드가 뷰포트 밖이면 루프를 정지한다.
 * - 탭이 백그라운드(`document.hidden`)면 루프를 정지한다.
 * - 백킹 스토어 해상도는 DPR 상한(모바일 1.5 / 그 외 2)으로 캡하고, 모바일은 프레임 간격을
 *   32ms(약 30fps)로 제한한다.
 * - 언마운트 시 rAF·옵저버·리스너를 모두 해제한다.
 *
 * MODULAR 신규 컴포넌트가 아니다 — 디자인 시스템에 캔버스/배경 계열 컴포넌트가 없고(오케스트레이터
 * 1.5단계 탐색 결과), 현재는 배경 데이터 모델에 강하게 결합돼 있어 서비스 전용으로 둔다.
 */
export default function BlobAnimationBackground({ params, className }: BlobAnimationBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  /** 누적 재생 시간(ms). 일시정지·파라미터 변경으로 effect가 재실행돼도 이어서 흐르게 한다. */
  const elapsedRef = useRef(0)
  /** rAF 루프가 항상 최신 파라미터를 읽도록 ref로 넘긴다 — 슬라이더를 움직여도 루프를 재시작하지 않는다.
   *  갱신은 아래 effect에서만 한다(렌더 중 ref 쓰기 금지). */
  const paramsRef = useRef(params)
  /** 정지 상태(감속 모드·뷰포트 밖)에서 파라미터가 바뀌었을 때 한 장만 다시 그리기 위한 훅 */
  const redrawRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const coarse = isCoarsePointer()
    const dprCap = coarse ? 1.5 : 2
    const frameInterval = coarse ? 32 : 16

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    let reduced = motionQuery.matches
    let inView = true
    let running = false
    let rafId = 0
    let lastTs = 0

    const render = () => {
      const cssWidth = canvas.clientWidth
      const cssHeight = canvas.clientHeight
      if (cssWidth <= 0 || cssHeight <= 0) return

      const dpr = Math.min(window.devicePixelRatio || 1, dprCap)
      const backingWidth = Math.max(1, Math.round(cssWidth * dpr))
      const backingHeight = Math.max(1, Math.round(cssHeight * dpr))
      if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
        canvas.width = backingWidth
        canvas.height = backingHeight
      }

      drawBlobFrame(ctx, canvas.width, canvas.height, paramsRef.current, elapsedRef.current)
    }
    redrawRef.current = render

    const tick = (ts: number) => {
      rafId = requestAnimationFrame(tick)
      if (lastTs === 0) lastTs = ts
      const delta = ts - lastTs
      // 스로틀 — 간격이 차기 전에는 누적도 그리기도 하지 않는다(정지 중 시간이 튀지 않도록).
      if (delta < frameInterval) return
      lastTs = ts
      elapsedRef.current += delta
      render()
    }

    const start = () => {
      if (running) return
      running = true
      lastTs = 0
      rafId = requestAnimationFrame(tick)
    }

    const stop = () => {
      if (!running) return
      running = false
      cancelAnimationFrame(rafId)
      rafId = 0
    }

    const sync = () => {
      if (inView && !document.hidden && !reduced) {
        start()
      } else {
        stop()
        // 정지해도 카드가 비어 보이지 않도록 마지막 상태를 한 장 남긴다.
        render()
      }
    }

    const handleMotionChange = (e: MediaQueryListEvent) => {
      reduced = e.matches
      sync()
    }
    const handleVisibility = () => sync()

    const resizeObserver = new ResizeObserver(() => render())
    resizeObserver.observe(canvas)

    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        inView = entries.some((entry) => entry.isIntersecting)
        sync()
      },
      { threshold: 0 }
    )
    intersectionObserver.observe(canvas)

    motionQuery.addEventListener('change', handleMotionChange)
    document.addEventListener('visibilitychange', handleVisibility)

    render()
    sync()

    return () => {
      stop()
      redrawRef.current = null
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      motionQuery.removeEventListener('change', handleMotionChange)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  // 어드민 저작 중 슬라이더를 움직이면 즉시 반영한다. 루프가 도는 중이면 다음 프레임이 어차피
  // 최신 값을 쓰므로 한 장 더 그려도 무해하고, 정지 상태(감속 모드·뷰포트 밖)에서는 이 호출만이
  // 미리보기를 갱신한다. 위 setup effect가 먼저 실행되므로 마운트 첫 프레임은 useRef 초기값
  // (= 같은 params)을 쓴다 — 어긋나지 않는다.
  useEffect(() => {
    paramsRef.current = params
    redrawRef.current?.()
  }, [params])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className ?? 'absolute inset-0 w-full h-full pointer-events-none'}
    />
  )
}

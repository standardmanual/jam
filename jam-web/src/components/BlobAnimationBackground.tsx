'use client'

import { useEffect, useRef } from 'react'
import { BLOB_PHASE_RATE, BLOB_STILL_T, drawBlobFrame, type BlobAnimationParams } from '@/lib/blobAnimation'

interface BlobAnimationBackgroundProps {
  params: BlobAnimationParams
  /** 추가 클래스. 안전 클래스(절대배치·클릭 통과)에 **덧붙는다**(치환하지 않는다). */
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
 * 뷰포트 안에 있는 동안에는 **계속 재생한다**(사용자 결정). 한때 8초 재생 후 감속 정지를 넣었으나,
 * 무한 재생이 원래 요청("애니메이션 배경")에 맞고 성능은 아래 가드로 이미 확보돼 있다.
 *
 * 성능 가드(티켓 필수 요구사항) — `ctx.filter`의 blur를 매 프레임 6회 호출하므로 비용이 크다.
 * 아래를 모두 적용한다:
 * - 블롭은 blur가 충분히 클 때 **1/3 해상도 오프스크린 캔버스**에 그린 뒤 확대 합성한다
 *   (blur 비용 약 1/9).
 * - `IntersectionObserver`로 카드가 뷰포트 밖이면 루프를 정지한다.
 * - 탭이 백그라운드(`document.hidden`)면 루프를 정지한다.
 * - 백킹 스토어 해상도는 DPR 상한(모바일 1.5 / 그 외 2)으로 캡한다. coarse 포인터에서는 프레임
 *   간격을 32ms(약 30fps)로 제한하되, fine 포인터(데스크톱)는 스로틀 없이 rAF에 맡긴다 —
 *   16ms 고정은 120Hz 화면을 60fps로 묶어 오히려 프레임 페이싱을 어긋나게 했다.
 * - 언마운트 시 rAF·옵저버·미디어쿼리 리스너를 모두 해제한다.
 *
 * 접근성 — 세 신호를 각각 독립적으로 다루고, 모두 런타임 변경(`change`)에 반응한다:
 * - `prefers-reduced-motion: reduce` → 루프를 돌리지 않고 고정 위상(`BLOB_STILL_T`) 정지
 *   프레임만 그린다. 배경을 통째로 숨기면 카드가 비어 보이므로 정지 프레임은 유지한다.
 * - `prefers-contrast: more` → 블롭을 그리지 않고 배경색 단색으로 평탄화한다.
 * - `prefers-reduced-transparency: reduce` → 블롭 알파 1.0 / blur 절반.
 *
 * MODULAR 신규 컴포넌트가 아니다 — 디자인 시스템에 캔버스/배경 계열 컴포넌트가 없고(오케스트레이터
 * 1.5단계 탐색 결과), 현재는 배경 데이터 모델에 강하게 결합돼 있어 서비스 전용으로 둔다.
 */
export default function BlobAnimationBackground({ params, className }: BlobAnimationBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  /**
   * 누적 애니메이션 **위상**(rad). 예전에는 경과 ms를 누적하고 그리기 시점에 speed를 곱했는데,
   * 그러면 속도 슬라이더를 움직일 때 위상 전체가 재스케일돼 블롭이 순간이동했다. 여기서 이미
   * speed를 반영해 누적하므로 지나온 구간은 다시 계산되지 않는다.
   */
  const tRef = useRef(0)
  /** rAF 루프가 항상 최신 파라미터를 읽도록 ref로 넘긴다 — 슬라이더를 움직여도 루프를 재시작하지 않는다.
   *  갱신은 아래 effect에서만 한다(렌더 중 ref 쓰기 금지). */
  const paramsRef = useRef(params)
  /** 정지 상태(뷰포트 밖·reduced-motion)에서 파라미터가 바뀌었을 때 한 장만 다시 그리기 위한 훅 */
  const redrawRef = useRef<(() => void) | null>(null)
  /**
   * 아래 params effect는 마운트 시에도 한 번 실행된다. setup effect의 `sync()`가 이미 첫 프레임을
   * 그렸으므로 그때는 다시 그리지 않는다(같은 프레임 중복 렌더 방지).
   */
  const paramsSyncedRef = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    // 컨텍스트를 못 얻으면 캔버스는 투명한 채로 둔다 — 호출부(Hero 카드)가 서버에서 이미
    // 애니메이션 bgColor를 인라인 배경으로 깔아 두므로 카드가 비어 보이지는 않는다.
    if (!ctx) return

    const coarse = isCoarsePointer()
    const dprCap = coarse ? 1.5 : 2
    // fine 포인터는 스로틀 없이 rAF에 맡긴다(0이면 아래 `delta < frameInterval`이 항상 false).
    const frameInterval = coarse ? 32 : 0

    // 블롭 축소 렌더링용 오프스크린 캔버스 — 크기 조정은 drawBlobFrame이 알아서 한다.
    const scratch = document.createElement('canvas')

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const contrastQuery = window.matchMedia('(prefers-contrast: more)')
    const transparencyQuery = window.matchMedia('(prefers-reduced-transparency: reduce)')
    let reduced = motionQuery.matches
    let highContrast = contrastQuery.matches
    let opaque = transparencyQuery.matches
    let inView = true
    let running = false
    let rafId = 0
    let lastTs = 0
    /**
     * 캔버스의 CSS 크기 캐시. 예전에는 `render()`가 매 프레임 `clientWidth`/`clientHeight`를
     * **읽고** 마지막에 `style.opacity`를 **썼다** — 스타일 쓰기 → 다음 프레임 레이아웃 읽기가
     * 반복돼 프레임마다 강제 동기 레이아웃이 걸렸다. 치수는 이미 구독 중인 `ResizeObserver`에서만
     * 갱신하고 render는 캐시만 읽는다.
     */
    let cssWidth = 0
    let cssHeight = 0
    /** 첫 프레임 페이드 인은 한 번만 쓴다(반복 쓰기가 위 레이아웃 스래싱의 원인이었다). */
    let ready = false

    const measure = () => {
      cssWidth = canvas.clientWidth
      cssHeight = canvas.clientHeight
    }

    const render = () => {
      if (cssWidth <= 0 || cssHeight <= 0) return

      const dpr = Math.min(window.devicePixelRatio || 1, dprCap)
      const backingWidth = Math.max(1, Math.round(cssWidth * dpr))
      const backingHeight = Math.max(1, Math.round(cssHeight * dpr))
      if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
        canvas.width = backingWidth
        canvas.height = backingHeight
      }

      // reduced-motion에서는 누적 위상 대신 고정 위상으로 그려, 저작자가 확인할 수 있는 항상
      // 같은 구도의 정지 프레임을 보장한다.
      const phase = reduced ? BLOB_STILL_T : tRef.current
      drawBlobFrame(ctx, canvas.width, canvas.height, paramsRef.current, phase, {
        flatten: highContrast,
        opaque,
        scratch,
      })
      // 첫 페인트 하드컷 방지 — 그릴 내용이 실제로 생긴 뒤에 페이드 인한다(정지 프레임 포함).
      // opacity는 CSS(`.blob-animation-canvas[data-ready='true']`)가 담당하고 여기서는 신호만
      // 한 번 준다 — React의 선언형 style과 명령형 쓰기가 같은 속성을 다투지 않도록.
      if (!ready) {
        ready = true
        canvas.dataset.ready = 'true'
      }
    }
    redrawRef.current = render

    const tick = (ts: number) => {
      rafId = requestAnimationFrame(tick)
      if (lastTs === 0) lastTs = ts
      const delta = ts - lastTs
      // 스로틀 — 간격이 차기 전에는 누적도 그리기도 하지 않는다(정지 중 시간이 튀지 않도록).
      if (delta < frameInterval) return
      lastTs = ts
      tRef.current += delta * 0.001 * paramsRef.current.speed * BLOB_PHASE_RATE
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
    // 대비·투명도 신호는 재생 여부가 아니라 "무엇을 그리는가"만 바꾸므로 한 장 다시 그린다.
    // 루프가 돌고 있으면 다음 프레임이 어차피 새 값을 반영한다.
    const handleContrastChange = (e: MediaQueryListEvent) => {
      highContrast = e.matches
      render()
    }
    const handleTransparencyChange = (e: MediaQueryListEvent) => {
      opaque = e.matches
      render()
    }
    const handleVisibility = () => sync()

    // 치수 갱신은 여기 한 곳에서만 한다(render는 캐시만 읽는다).
    const resizeObserver = new ResizeObserver(() => {
      measure()
      render()
    })
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
    contrastQuery.addEventListener('change', handleContrastChange)
    transparencyQuery.addEventListener('change', handleTransparencyChange)
    document.addEventListener('visibilitychange', handleVisibility)

    // 첫 측정은 여기서 한 번 한다(ResizeObserver의 최초 콜백은 다음 프레임에나 온다).
    // sync()가 재생/정지 어느 쪽으로 가든 첫 프레임을 그린다 — 여기서 render()를 한 번 더
    // 호출하면 마운트 시 같은 프레임을 두 번 그리게 된다.
    measure()
    sync()

    return () => {
      stop()
      redrawRef.current = null
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      motionQuery.removeEventListener('change', handleMotionChange)
      contrastQuery.removeEventListener('change', handleContrastChange)
      transparencyQuery.removeEventListener('change', handleTransparencyChange)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  // 어드민 저작 중 슬라이더를 움직이면 즉시 반영한다. 루프가 도는 중이면 다음 프레임이 어차피
  // 최신 값을 쓰므로 한 장 더 그려도 무해하고, 정지 상태(뷰포트 밖·reduced-motion)에서는 이
  // 호출만이 미리보기를 갱신한다. 마운트 시에는 위 setup effect의 sync()가 이미 같은 params로
  // 첫 프레임을 그렸으므로 건너뛴다.
  useEffect(() => {
    paramsRef.current = params
    if (!paramsSyncedRef.current) {
      paramsSyncedRef.current = true
      return
    }
    redrawRef.current?.()
  }, [params])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      // 안전 클래스는 항상 유지하고 호출부 클래스를 **덧붙인다**. 예전에는 `className ?? '...'`
      // 치환이라 호출부가 클래스를 하나라도 넘기는 순간 절대배치·클릭 통과가 통째로 사라졌다.
      // `blob-animation-canvas`는 첫 프레임 페이드 인을 담당한다(globals.css) — 첫 프레임을 그리면
      // 위 render가 `data-ready="true"`를 한 번 붙인다. 컨텍스트를 못 얻거나 SSR~하이드레이션
      // 구간에서는 투명한 채로 남아 카드 배경색만 보인다.
      className={['blob-animation-canvas absolute inset-0 w-full h-full pointer-events-none', className]
        .filter(Boolean)
        .join(' ')}
    />
  )
}

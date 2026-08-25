'use client'

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { IconButton } from '@ds/components/buttons/IconButton'
import { cssDurationMs } from '@/lib/motion'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  /** compact: 콘텐츠 높이만큼(최대 75vh) / full: 화면 대부분을 채우는 큰 디텐트 */
  detent?: 'compact' | 'full'
  showCloseButton?: boolean
  closeLabel?: string
  /**
   * 스크롤 영역 밖, 시트 맨 아래에 항상 고정으로 보여줄 콘텐츠(주로 액션 버튼).
   *
   * `position: sticky`로 스크롤 영역 안에 붙이는 방식은 시도했으나 WebKit이
   * flex 컨테이너 안의 sticky를 안정적으로 지원하지 않아(자식이 flex item일 때
   * 레이아웃이 깨지는 알려진 버그) 콘텐츠가 겹쳐 보이거나 잘리는 문제가 있었다.
   * 대신 footer를 스크롤 영역과 완전히 분리된 형제 요소(shrink-0)로 두면
   * 순수 flexbox 레이아웃만으로 항상 화면에 보장되어 더 견고하다.
   */
  footer?: ReactNode
  /**
   * `detent="full"` 전용 — 화면 최상단에서 남길 여백(px). 지정하면 기본 `92dvh` 대신
   * `calc(100dvh - {topGapPx}px)`를 써서 TopNav를 살짝만(예: 20px) 남기고 화면 전체(탭바 포함)를
   * 덮는 시트를 만든다(배지 공유 미리보기처럼 이미지를 최대한 크게 보여줘야 하는 화면용).
   */
  topGapPx?: number
  /**
   * footer의 아래쪽 여백 기준. 기본값 `'tabbar'`는 화면에 여전히 떠 있는 플로팅 탭바
   * (safe-area+16px+64px+여유 12px)를 가리지 않도록 그 위에 여백을 둔다. 호출부가
   * `pushTabBarHidden`(`@/lib/uiOverlay`)으로 탭바를 물리적으로 숨기는 화면이라면
   * `'safe-area'`를 지정 — 탭바가 있던 자리까지 footer를 내려서 탭바의 원래 위치와
   * footer 하단이 정확히 맞도록 한다.
   */
  footerBottomInset?: 'tabbar' | 'safe-area'
  /**
   * 기본값 `true`는 콘텐츠 영역에 `overflow-y-auto`를 둔다. `false`로 두면
   * `overflow-hidden`으로 바뀐다 — 스크롤할 내용이 원래 없는 화면(예: 이미지 한 장짜리
   * 미리보기)에서 사용자가 실수로 살짝 드래그했을 때 iOS Safari가 그 제스처를 스크롤로
   * 인식해 동적 툴바를 접었다 펴며 `dvh` 기반 시트 높이가 스크롤할 때마다 커졌다 작아졌다
   * 하는 문제를 막는다.
   */
  contentScrollable?: boolean
}

const DRAG_CLOSE_THRESHOLD = 120
/** 릴리즈 순간 하향 속도(px/ms)가 이 값을 넘으면 거리와 무관하게 닫는다(플릭 제스처). */
const DRAG_CLOSE_VELOCITY = 0.5
/** 릴리즈 속도 계산에 쓸 포인터 샘플을 이 시간(ms) 이내로만 유지한다. */
const VELOCITY_SAMPLE_WINDOW_MS = 100

/** 마운트 게이트 전용 — 구독할 외부 스토어가 없으므로 아무것도 하지 않는 subscribe. */
const subscribeNoop = () => () => {}

/** 드래그 중인 시트 요소의 현재 translateY(px)를 계산한다 — 스프링백 트랜지션이
 *  아직 진행 중일 때 재드래그를 시작해도 현재 화면상 위치에서 자연스럽게 이어지도록 한다. */
function getCurrentTranslateY(el: HTMLElement): number {
  const transform = window.getComputedStyle(el).transform
  if (!transform || transform === 'none') return 0
  const match = transform.match(/matrix\(([^)]+)\)/)
  if (!match) return 0
  const parts = match[1].split(',').map((v) => parseFloat(v.trim()))
  return parts.length >= 6 && Number.isFinite(parts[5]) ? parts[5] : 0
}

export default function BottomSheet({
  open,
  onClose,
  title,
  children,
  detent = 'compact',
  showCloseButton = true,
  closeLabel = '닫기',
  footer,
  topGapPx,
  footerBottomInset = 'tabbar',
  contentScrollable = true,
}: BottomSheetProps) {
  const [dragY, setDragY] = useState(0)
  const draggingRef = useRef(false)
  const startYRef = useRef(0)
  const sheetRef = useRef<HTMLDivElement>(null)
  /** 드래그 시작 시점의 기준 translateY — 진행 중인 스프링백 트랜지션 위에서 재드래그해도
   *  현재 위치부터 이어지도록 한다(고정 200ms 트랜지션이 끝나기 전 재드래그 시 점프 방지). */
  const dragBaseRef = useRef(0)
  /** 릴리즈 속도 계산용 최근 포인터 샘플(timestamp, clientY). */
  const velocitySamplesRef = useRef<{ t: number; y: number }[]>([])

  // Panel reveal(07-panel-reveal.md) — 열림/닫힘 동안 DOM에 남아 있어야 하므로
  // "열린 상태(shown)"와 "닫힘 트랜지션 잔류(lingering)"를 분리한다.
  //  · 열 때: 먼저 닫힌 상태로 마운트 → 다음 프레임에 data-open=true (트랜지션 발화)
  //  · 닫을 때: data-open=false → --panel-close-dur 후 언마운트
  const [shown, setShown] = useState(false)
  const [lingering, setLingering] = useState(false)

  // 20260825_039: 시트를 document.body로 포털링하기 위한 마운트 게이트.
  // `document`는 클라이언트에만 존재하므로 SSR·하이드레이션 렌더에서는 false를 돌려주고
  // (아무것도 렌더하지 않음), 하이드레이션이 끝난 뒤에만 true가 되어 포털을 만든다.
  // useEffect+setState 대신 useSyncExternalStore를 쓰는 이유는 effect 안의 동기 setState가
  // 캐스케이딩 렌더를 만든다는 react-hooks 규칙에 걸리기 때문(uiOverlay.ts와 같은 방식).
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false
  )

  useEffect(() => {
    if (!open) {
      setDragY(0)
      dragBaseRef.current = 0
      velocitySamplesRef.current = []
    }
  }, [open])

  useEffect(() => {
    if (open) {
      const raf = requestAnimationFrame(() => {
        setLingering(true)
        setShown(true)
      })
      return () => cancelAnimationFrame(raf)
    }
    const raf = requestAnimationFrame(() => setShown(false))
    const timer = setTimeout(() => setLingering(false), cssDurationMs('--panel-close-dur', 350))
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timer)
    }
  }, [open])

  // 시트가 화면에 떠 있는 동안 배경(main 스크롤 컨테이너)의 스크롤을 잠근다 — 배경이 스크롤되며
  // iOS Safari 동적 툴바가 접혔다 펴지면 dvh 기반 시트 높이가 함께 흔들리는 문제를 막는다.
  useEffect(() => {
    if (!lingering) return
    const scroller = document.querySelector<HTMLElement>('main')
    const prevOverflow = scroller?.style.overflow
    if (scroller) scroller.style.overflow = 'hidden'
    return () => {
      if (scroller) scroller.style.overflow = prevOverflow ?? ''
    }
  }, [lingering])

  if (!mounted) return null
  if (!open && !lingering) return null

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    draggingRef.current = true
    startYRef.current = e.clientY
    // 스프링백 트랜지션이 아직 진행 중일 수 있으므로, 화면에 실제로 보이는 현재
    // translateY를 읽어 그 지점부터 드래그가 이어지게 한다(고정 duration 트랜지션 중
    // 재드래그 시 점프 방지).
    dragBaseRef.current = sheetRef.current ? Math.max(0, getCurrentTranslateY(sheetRef.current)) : 0
    setDragY(dragBaseRef.current)
    velocitySamplesRef.current = [{ t: e.timeStamp, y: e.clientY }]
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return
    const delta = e.clientY - startYRef.current
    setDragY(Math.max(0, dragBaseRef.current + delta))

    velocitySamplesRef.current.push({ t: e.timeStamp, y: e.clientY })
    const cutoff = e.timeStamp - VELOCITY_SAMPLE_WINDOW_MS
    velocitySamplesRef.current = velocitySamplesRef.current.filter((s) => s.t >= cutoff)
  }

  function handlePointerUp() {
    if (!draggingRef.current) return
    draggingRef.current = false

    // 릴리즈 속도(px/ms) — 짧고 빠른 하향 플릭이면 거리(dragY)와 무관하게 닫는다.
    const samples = velocitySamplesRef.current
    let velocity = 0
    if (samples.length >= 2) {
      const first = samples[0]
      const last = samples[samples.length - 1]
      const dt = last.t - first.t
      if (dt > 0) velocity = (last.y - first.y) / dt
    }

    if (dragY > DRAG_CLOSE_THRESHOLD || velocity > DRAG_CLOSE_VELOCITY) onClose()
    setDragY(0)
    dragBaseRef.current = 0
    velocitySamplesRef.current = []
  }

  const hasHeader = Boolean(title) || showCloseButton

  /*
    20260825_039: 시트를 호출부 자리에 그대로 렌더하면, 조상에 스태킹 컨텍스트를 만드는 요소
    (예: 배지 상세의 `relative z-10` 섹션)가 있을 때 이 루트의 z-50이 그 컨텍스트 '내부' 값으로만
    평가된다. 그러면 루트 컨텍스트에 z-40으로 참여하는 플로팅 탭바나, DOM상 뒤에 오는 형제
    섹션들이 시트 위에 페인트되고(시트가 투명해 보이는 착시), 백드롭 blur도 화면 일부에만 걸린다.
    document.body로 포털링하면 조상 스태킹 컨텍스트를 벗어나 z-50이 루트 기준으로 평가된다.
  */
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col justify-end" style={{ maxWidth: 430, margin: '0 auto' }}>
      {/* Backdrop — 20260823_003: 재질(가벼운 blur) + prefers-reduced-transparency 가드는
          .t-panel-backdrop(transitions.css)에 공용으로 정의(FeedSection·PoiCarouselModal과
          공유). 시트 본체(아래 bg-[var(--color-surface)])는 계속 불투명 유지. */}
      <div className="absolute inset-0 bg-surface/60 t-panel-backdrop" data-open={shown} onClick={onClose} />

      {/*
        Panel reveal 래퍼.
        시트 본체는 드래그-닫기용 inline transform을 쓰기 때문에, 트랜지션용
        transform과 충돌하지 않도록 한 겹 감싼다. --panel-translate-y를 100%로
        두어 시트 자기 높이만큼 아래에서 올라오게 한다.
      */}
      <div
        className="relative flex flex-col min-h-0 t-panel-slide"
        data-open={shown}
        style={{ '--panel-translate-y': '100%' } as CSSProperties}
      >
      {/* Sheet */}
      <div
        ref={sheetRef}
        className={[
          'relative rounded-t-[var(--radius-cards)] flex flex-col',
          'bg-[var(--color-surface)] text-text',
          /* dvh(동적 뷰포트 높이) 사용 — iOS Safari는 vh를 주소창이 숨겨진
             상태의 레이아웃 뷰포트 기준으로 계산해서, 주소창이 보이는 상태로
             열리면 시트 하단과 실제 화면 하단 사이에 틈이 생겨 그 틈으로
             플로팅 탭바(z-40)나 뒷배경이 노출된다(이 시트 자체는 z-50이라
             탭바보다 위에 있어야 정상). dvh는 실제 보이는 뷰포트 기준이라
             이 틈이 생기지 않는다. */
          topGapPx === undefined ? (detent === 'full' ? 'h-[92dvh]' : 'max-h-[75dvh]') : '',
        ].join(' ')}
        style={{
          transform: `translateY(${dragY}px)`,
          transition: draggingRef.current ? 'none' : 'transform 200ms ease-out',
          ...(topGapPx !== undefined ? { height: `calc(100dvh - ${topGapPx}px)` } : {}),
        }}
      >
        {/* Handle */}
        <div
          className="flex justify-center pt-3 pb-1 shrink-0 touch-none cursor-grab"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {/* 20260816_012: 보더로 그린 속 빈 핸들 → 실제 채워진 바로 교체 */}
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {hasHeader && (
          <div className="flex items-center justify-between px-[var(--spacing-24)] pb-[var(--spacing-16)] shrink-0">
            {title ? (
              <h2 className="text-[length:var(--text-body)] leading-[var(--leading-body)]">{title}</h2>
            ) : (
              <span />
            )}
            {showCloseButton && <IconButton icon="close" label={closeLabel} onClick={onClose} />}
          </div>
        )}

        <div className={contentScrollable ? 'overflow-y-auto flex-1' : 'overflow-hidden overscroll-none flex-1'}>
          {children}
        </div>

        {footer ? (
          /* 스크롤 영역과 분리된 형제 요소 — flex-1인 위 스크롤 영역이 알아서
             줄어들기 때문에 콘텐츠 길이와 무관하게 항상 화면에 보인다.
             footerBottomInset='tabbar'(기본값): 플로팅 탭바(safe-area+16px+64px) 높이 + 여유
             12px을 padding-bottom에 더해 탭바를 가리지 않게 한다.
             footerBottomInset='safe-area': 탭바를 `pushTabBarHidden`으로 물리적으로 숨기는
             화면 전용 — 탭바의 원래 위치(safe-area+16px)까지 그대로 내려서 footer 하단이
             탭바가 있던 자리와 정확히 맞도록 한다. */
          <div
            // 20260816_012: 상단 1px 구분선(hr 대체) 제거 → 스크롤 영역과 다른 배경톤으로 구분
            className="shrink-0 px-[var(--spacing-16)] pt-[var(--spacing-16)] bg-surface-elevated"
            style={{
              paddingBottom:
                footerBottomInset === 'safe-area'
                  ? 'calc(env(safe-area-inset-bottom) + 16px)'
                  : 'calc(env(safe-area-inset-bottom) + 16px + 64px + 12px)',
            }}
          >
            {footer}
          </div>
        ) : (
          <div className="shrink-0 pb-[env(safe-area-inset-bottom,1rem)]" />
        )}
      </div>
      </div>
    </div>,
    document.body
  )
}

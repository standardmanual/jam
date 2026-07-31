'use client'

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import { CloseIcon } from './icons'
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
}

const DRAG_CLOSE_THRESHOLD = 120

export default function BottomSheet({
  open,
  onClose,
  title,
  children,
  detent = 'compact',
  showCloseButton = true,
  closeLabel = '닫기',
  footer,
}: BottomSheetProps) {
  const [dragY, setDragY] = useState(0)
  const draggingRef = useRef(false)
  const startYRef = useRef(0)

  // Panel reveal(07-panel-reveal.md) — 열림/닫힘 동안 DOM에 남아 있어야 하므로
  // "열린 상태(shown)"와 "닫힘 트랜지션 잔류(lingering)"를 분리한다.
  //  · 열 때: 먼저 닫힌 상태로 마운트 → 다음 프레임에 data-open=true (트랜지션 발화)
  //  · 닫을 때: data-open=false → --panel-close-dur 후 언마운트
  const [shown, setShown] = useState(false)
  const [lingering, setLingering] = useState(false)

  useEffect(() => {
    if (!open) setDragY(0)
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

  if (!open && !lingering) return null

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    draggingRef.current = true
    startYRef.current = e.clientY
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return
    const delta = e.clientY - startYRef.current
    if (delta > 0) setDragY(delta)
  }

  function handlePointerUp() {
    if (!draggingRef.current) return
    draggingRef.current = false
    if (dragY > DRAG_CLOSE_THRESHOLD) onClose()
    setDragY(0)
  }

  const hasHeader = Boolean(title) || showCloseButton

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" style={{ maxWidth: 430, margin: '0 auto' }}>
      {/* Backdrop */}
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
        className={[
          'relative bg-surface-inverse text-text-inverse rounded-t-[var(--radius-cards)] flex flex-col',
          /* dvh(동적 뷰포트 높이) 사용 — iOS Safari는 vh를 주소창이 숨겨진
             상태의 레이아웃 뷰포트 기준으로 계산해서, 주소창이 보이는 상태로
             열리면 시트 하단과 실제 화면 하단 사이에 틈이 생겨 그 틈으로
             플로팅 탭바(z-40)나 뒷배경이 노출된다(이 시트 자체는 z-50이라
             탭바보다 위에 있어야 정상). dvh는 실제 보이는 뷰포트 기준이라
             이 틈이 생기지 않는다. */
          detent === 'full' ? 'h-[92dvh]' : 'max-h-[75dvh]',
        ].join(' ')}
        style={{
          transform: `translateY(${dragY}px)`,
          transition: draggingRef.current ? 'none' : 'transform 200ms ease-out',
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
          <div className="w-10 h-1 rounded-full shadow-[inset_0_0_0_1px_var(--color-border-inverse)]" />
        </div>

        {hasHeader && (
          <div className="flex items-center justify-between px-[var(--spacing-24)] pb-[var(--spacing-16)] shadow-[inset_0_-1px_0_0_var(--color-border-inverse)] shrink-0">
            {title ? (
              <h2 className="text-[length:var(--text-body)] leading-[var(--leading-body)]">{title}</h2>
            ) : (
              <span />
            )}
            {showCloseButton && (
              <button
                onClick={onClose}
                aria-label={closeLabel}
                className="w-11 h-11 -mr-2 flex items-center justify-center text-text-inverse/60 active:scale-90 transition-transform duration-100"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        <div className="overflow-y-auto flex-1">{children}</div>

        {footer ? (
          /* 스크롤 영역과 분리된 형제 요소 — flex-1인 위 스크롤 영역이 알아서
             줄어들기 때문에 콘텐츠 길이와 무관하게 항상 화면에 보인다. */
          <div className="shrink-0 px-[var(--spacing-16)] pt-[var(--spacing-16)] pb-[env(safe-area-inset-bottom,1rem)] shadow-[inset_0_1px_0_0_var(--color-border-inverse)]">
            {footer}
          </div>
        ) : (
          <div className="shrink-0 pb-[env(safe-area-inset-bottom,1rem)]" />
        )}
      </div>
      </div>
    </div>
  )
}

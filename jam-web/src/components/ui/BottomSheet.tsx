'use client'

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { CloseIcon } from './icons'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  /** compact: 콘텐츠 높이만큼(최대 75vh) / full: 화면 대부분을 채우는 큰 디텐트 */
  detent?: 'compact' | 'full'
  showCloseButton?: boolean
  closeLabel?: string
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
}: BottomSheetProps) {
  const [dragY, setDragY] = useState(0)
  const draggingRef = useRef(false)
  const startYRef = useRef(0)

  useEffect(() => {
    if (!open) setDragY(0)
  }, [open])

  if (!open) return null

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
      <div className="absolute inset-0 bg-surface/60" onClick={onClose} />

      {/* Sheet */}
      <div
        className={[
          'relative bg-surface-inverse text-text-inverse rounded-t-[var(--radius-cards)] flex flex-col',
          detent === 'full' ? 'h-[92vh]' : 'max-h-[75vh]',
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

        <div className="shrink-0 pb-[env(safe-area-inset-bottom,1rem)]" />
      </div>
    </div>
  )
}

import React, { useEffect, useRef } from 'react';

/**
 * BottomSheet — slide-up overlay panel for contextual content.
 * Shares focus-trap and Escape-dismiss pattern with ModalToast.
 *
 * props: open / onClose / title / children / detent / footer / topGapPx /
 * footerBottomInset / contentScrollable — matches the service implementation's
 * API (`src/components/ui/BottomSheet.tsx`). Swipe-to-dismiss (드래그투클로즈)
 * is intentionally excluded from this minimal implementation due to touch
 * event complexity — the service component has its own richer drag-based
 * close gesture that isn't ported here (20260901_1926, jam-ds §3 — "단순
 * 스왑 금지").
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
  detent = 'compact',
  footer,
  topGapPx,
  footerBottomInset = 'tabbar',
  contentScrollable = true,
}) {
  const panelRef = useRef(null);
  const labelId = React.useId();

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement;

    /* Move focus into the panel */
    const focusable = panelRef.current?.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable?.[0];
    first ? first.focus() : panelRef.current?.focus();

    /* Focus trap */
    const onKeyDown = (e) => {
      if (e.key === 'Escape') { onClose?.(); return; }
      if (e.key !== 'Tab') return;
      if (!focusable || focusable.length === 0) { e.preventDefault(); return; }
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      prev?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  const footerPaddingBottomPx = footerBottomInset === 'safe-area' ? 16 : 16 + 64 + 12;

  return (
    /* Overlay */
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'var(--color-overlay)',
        zIndex: 50,
        display: 'flex', alignItems: 'flex-end',
      }}
    >
      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? labelId : undefined}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          // 20260816_012: 보더 제거 — 오버레이 위에서도 구분되도록 --color-surface-elevated 사용
          background: 'var(--color-surface-elevated)',
          borderRadius: 'var(--radius-card) var(--radius-card) 0 0',
          boxSizing: 'border-box',
          animation: 'ds-bottomsheet-in var(--duration-medium) var(--ease-bounce) both',
          outline: 'none',
          ...(topGapPx !== undefined
            ? { height: `calc(100dvh - ${topGapPx}px)` }
            : { maxHeight: detent === 'full' ? '92dvh' : '75dvh' }),
        }}
      >
        {/* Drag handle — decorative (swipe-to-dismiss 자체는 미구현) */}
        <div style={{
          width: 36, height: 4,
          borderRadius: 'var(--radius-pill)',
          background: 'var(--color-border)',
          margin: 'var(--layout-card-padding) auto 0',
          flexShrink: 0,
        }} aria-hidden="true" />

        <div style={{
          padding: '0 var(--layout-card-padding)',
          overflowY: contentScrollable ? 'auto' : 'hidden',
          flex: 1,
          minHeight: 0,
        }}>
          {title && (
            <h2
              id={labelId}
              style={{
                margin: 'var(--spacing-16) 0',
                // 서비스(src/components/ui/BottomSheet.tsx)의 <h2> 가 기준이다:
                // text-[length:var(--text-body)] leading-[var(--leading-body)]
                fontSize: 'var(--text-body)',
                lineHeight: 'var(--leading-body)',
                fontWeight: 700,
                color: 'var(--color-text)',
              }}
            >
              {title}
            </h2>
          )}
          {children}
        </div>

        {footer ? (
          <div
            style={{
              flexShrink: 0,
              padding: 'var(--spacing-16)',
              paddingBottom: `calc(${footerPaddingBottomPx}px + var(--spacing-safe-bottom))`,
              background: 'var(--color-surface-elevated)',
            }}
          >
            {footer}
          </div>
        ) : (
          <div style={{ flexShrink: 0, paddingBottom: 'calc(var(--layout-card-padding) + var(--spacing-safe-bottom))' }} />
        )}
      </div>

      <style>{`
        @keyframes ds-bottomsheet-in {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

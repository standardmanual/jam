import React, { useEffect, useRef } from 'react';

/**
 * BottomSheet — slide-up overlay panel for contextual content.
 * Shares focus-trap and Escape-dismiss pattern with ModalToast.
 *
 * props: open / onClose / title / children / detent / footer / topGapPx /
 * footerBottomInset / contentScrollable / panelTone — matches the service implementation's
 * API (`src/components/ui/BottomSheet.tsx`). Swipe-to-dismiss (드래그투클로즈)
 * is intentionally excluded from this minimal implementation due to touch
 * event complexity — the service component has its own richer drag-based
 * close gesture that isn't ported here (20260901_1926, jam-ds §3 — "단순
 * 스왑 금지").
 *
 * 면(티켓 20261015_2133): 스크림 --backdrop(검정 50%) / 패널 --background(크림) / 푸터 --surface(흰) /
 * 핸들 --border. 서비스 `src/components/ui/BottomSheet.tsx`와 같은 값이다. 푸터 구분선은 두지 않는다.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
  detent = 'compact',
  footer,
  topGapPx,
  contentScrollable = true,
  panelTone = 'card',
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

  // 캔버스 «JAM! 바텀시트» 기준(티켓 20261110_2150): footer 좌우 20 · 위 8 · 아래 20+안전영역. footerBottomInset은 값과 무관하게 같은 여백이다(deprecated).

  return (
    /* Overlay */
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'var(--backdrop)',
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
          // 패널과 푸터 모두 흰 면(--card-bg·--surface) — 서비스 BottomSheet.tsx와 같은 쌍이다
          // (티켓 20261015_2133). 스크림(--backdrop 검정 50%) 위에서 패널 경계는 3.94:1로 보인다.
          // panelTone='background'면 패널과 푸터 모두 페이지 바탕(--background)이다(티켓 20261112_1629)
          background: panelTone === 'background' ? 'var(--background)' : 'var(--card-bg)',
          borderRadius: 'var(--radius-2xl) var(--radius-2xl) 0 0',
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
          borderRadius: 'var(--radius-full)',
          background: 'var(--border)',
          margin: 'var(--spacing-12) auto 0',
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
                margin: 'var(--spacing-24) 0',
                // 서비스(src/components/ui/BottomSheet.tsx)의 <h2> 가 기준이다:
                // text-xl font-bold leading-6 (크고 굵은 제목, 티켓 20261110_2048)
                fontSize: 'var(--text-xl)',
                lineHeight: 'var(--spacing-24)',
                fontWeight: 700,
                color: 'var(--foreground)',
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
              padding: 'var(--spacing-8) var(--spacing-20)',
              paddingBottom: 'calc(var(--spacing-20) + var(--spacing-safe-bottom))',
              background: panelTone === 'background' ? 'var(--background)' : 'var(--surface)',
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

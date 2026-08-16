import React, { useEffect, useRef } from 'react';

/**
 * BottomSheet — slide-up overlay panel for contextual content.
 * Shares focus-trap and Escape-dismiss pattern with ModalToast.
 *
 * props:
 *   open       — controlled visibility
 *   onDismiss  — called on overlay click or Escape
 *   title      — optional header label (aria-labelledby target)
 *   children   — panel body content
 *
 * Swipe-to-dismiss is intentionally excluded from this minimal implementation
 * due to touch event complexity; planned for a future iteration.
 */
export function BottomSheet({ open, onDismiss, title, children }) {
  const panelRef = useRef(null);
  const labelId = React.useId ? React.useId() : 'bottom-sheet-label';

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
      if (e.key === 'Escape') { onDismiss?.(); return; }
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
  }, [open, onDismiss]);

  if (!open) return null;

  return (
    /* Overlay */
    <div
      onClick={onDismiss}
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
          background: 'var(--color-surface)',
          borderTop: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-card) var(--radius-card) 0 0',
          padding: 'var(--layout-card-padding)',
          paddingBottom: 'calc(var(--layout-card-padding) + var(--spacing-safe-bottom))',
          boxSizing: 'border-box',
          animation: 'ds-bottomsheet-in var(--duration-medium) var(--ease-bounce) both',
          outline: 'none',
        }}
      >
        {/* Drag handle — decorative */}
        <div style={{
          width: 36, height: 4,
          borderRadius: 'var(--radius-pill)',
          background: 'var(--color-border)',
          margin: '0 auto var(--spacing-16)',
        }} aria-hidden="true" />

        {title && (
          <h2
            id={labelId}
            style={{
              margin: '0 0 var(--spacing-16)',
              fontSize: 'var(--text-title)',
              fontWeight: 700,
              color: 'var(--color-text)',
            }}
          >
            {title}
          </h2>
        )}
        {children}
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

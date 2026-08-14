import React, { useEffect, useRef } from 'react';

/* Inline SVG icon paths — no CDN dependency */
const ICONS = {
  success: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={26} height={26} aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  error: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={26} height={26} aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={26} height={26} aria-hidden="true">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><circle cx="12" cy="8" r="0.5" fill="currentColor" />
    </svg>
  ),
};

/**
 * ModalToast — centered modal overlay for emphasis moments (badge earned, mission complete).
 * v2 changes:
 *   - role="dialog" aria-modal="true" aria-labelledby added (WCAG modal pattern)
 *   - Focus moves to dismiss button on open; restored on close
 *   - Escape key dismisses
 *   - width: 240 hardcoded → min/max-width responsive
 *   - CDN icon replaced with inline SVG
 *   - deprecated --color-surface-card → --color-surface
 */
/**
 * iconSlot — optional ReactNode that replaces the default type icon circle.
 * Use to pass a BadgeFrame or any custom element into the icon position.
 * Accessibility (aria attributes, alt text) for iconSlot content is the caller's responsibility.
 */
export function ModalToast({ message, type = 'success', open = true, onDismiss, iconSlot }) {
  const dismissRef = useRef(null);
  const labelId = React.useId ? React.useId() : 'modal-toast-label';

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement;
    dismissRef.current?.focus();

    /* DS-009: Hide document behind the dialog from assistive technology.
       Siblings of document.body's modal container get inert so screen readers
       cannot escape the dialog (supplements aria-modal for older AT). */
    const siblings = Array.from(document.body.children).filter(
      (el) => !el.contains(dismissRef.current?.closest('[role="dialog"]'))
    );
    siblings.forEach((el) => { el.setAttribute('inert', ''); el.setAttribute('aria-hidden', 'true'); });

    const onKey = (e) => { if (e.key === 'Escape') onDismiss?.(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      siblings.forEach((el) => { el.removeAttribute('inert'); el.removeAttribute('aria-hidden'); });
      prev?.focus();
    };
  }, [open, onDismiss]);

  if (!open) return null;

  return (
    <div
      onClick={onDismiss}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 60,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-card)',
          padding: 'var(--layout-card-padding)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
          minWidth: 240, maxWidth: 'min(340px, 90vw)',
          textAlign: 'center',
        }}
      >
        {iconSlot
          ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>{iconSlot}</div>
          : (
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'var(--color-primary)',
              color: 'var(--color-text-on-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {ICONS[type]}
            </div>
          )
        }
        <p id={labelId} style={{ margin: 0, fontSize: 'var(--text-body)', color: 'var(--color-text)' }}>
          {message}
        </p>
        <button
          ref={dismissRef}
          onClick={onDismiss}
          style={{
            marginTop: 4, padding: '10px 24px',
            borderRadius: 'var(--radius-pill)', border: 'none',
            background: 'var(--color-primary)', color: 'var(--color-text-on-primary)',
            fontSize: 'var(--text-small)', fontWeight: 600, cursor: 'pointer',
            fontFamily: 'var(--font-family-base)',
          }}
        >
          확인
        </button>
      </div>
    </div>
  );
}

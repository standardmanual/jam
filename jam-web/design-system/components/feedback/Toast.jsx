import React, { useEffect, useState } from 'react';

/* Inline SVG icons — no CDN dependency */
const ICONS = {
  success: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={16} height={16} aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  error: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={16} height={16} aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16} aria-hidden="true">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><circle cx="12" cy="8" r="0.5" fill="currentColor" />
    </svg>
  ),
};

/**
 * Toast — bottom-anchored transient message.
 * type: 'success' | 'error' | 'info'
 *
 * v2 changes:
 *   - CDN icon replaced with inline SVG
 *   - role="status" aria-live="polite" added for screen reader announcement
 */
export function Toast({ message, type = 'info', open = true, onDismiss }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(open), 10);
    return () => clearTimeout(t);
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 12px 10px 20px', borderRadius: 'var(--radius-pill)',
        background: 'var(--color-bg-inverse)', color: 'var(--color-text-inverse)',
        fontSize: 'var(--text-small)',
        // 20260816_012: 보더 제거 — 흰 토스트가 다크 배경 위에서 대비만으로 충분히 구분됨
        transform: visible ? 'translateY(0)' : 'translateY(8px)',
        opacity: visible ? 1 : 0,
        transition: 'transform var(--duration-fast) var(--ease-smooth-out), opacity var(--duration-fast) ease',
      }}
    >
      <span style={{ color: 'var(--color-text-inverse)', flexShrink: 0 }}>
        {ICONS[type]}
      </span>
      <span style={{ flex: 1 }}>{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="알림 닫기"
          style={{
            flexShrink: 0,
            width: 28, height: 28,
            borderRadius: '50%', border: 'none',
            background: 'transparent', color: 'var(--color-text-inverse)',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 0,
          }}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" width={14} height={14} aria-hidden="true">
            <line x1="12" y1="4" x2="4" y2="12" /><line x1="4" y1="4" x2="12" y2="12" />
          </svg>
        </button>
      )}
    </div>
  );
}

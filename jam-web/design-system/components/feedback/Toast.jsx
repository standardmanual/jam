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
 * 위치(20261125_1840): 이 컴포넌트는 한 줄의 겉모양만 그린다. 화면에 놓을 때는 컨테이너를
 * `position: fixed; bottom: var(--toast-bottom)`(tokens/spacing.css)에 둔다.
 * 값은 플로팅 탭바 윗면에서 8px 위이고, 탭바의 `--tabbar-bottom`·`--tabbar-height`를 따른다. 숫자를 직접 적지 않는다.
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
      onClick={onDismiss}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 8,
        padding: '12px 16px', borderRadius: 'var(--radius-3xl)',
        background: 'var(--background-inverse)', color: 'var(--snow)',
        fontSize: 'var(--text-base)', lineHeight: 'var(--text-base--line-height)',
        cursor: onDismiss ? 'pointer' : 'default',
        // 20260816_012: 보더 제거 — 흰 토스트가 다크 배경 위에서 대비만으로 충분히 구분됨
        // 20261125_1444: 서비스 Toast.tsx와 동일 규격(rounded-3xl, 16px, X 버튼 없이 탭으로 닫기)
        transform: visible ? 'translateY(0)' : 'translateY(8px)',
        opacity: visible ? 1 : 0,
        transition: 'transform var(--duration-fast) var(--ease-smooth-out), opacity var(--duration-fast) ease',
      }}
    >
      <span style={{ display: 'flex', height: 24, alignItems: 'center', color: 'var(--muted-on-inverse)', flexShrink: 0 }}>
        {ICONS[type]}
      </span>
      <span style={{ flex: 1, minWidth: 0, wordBreak: 'keep-all', overflowWrap: 'break-word' }}>{message}</span>
    </div>
  );
}

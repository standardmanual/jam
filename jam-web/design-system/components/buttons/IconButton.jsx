import React from 'react';

/**
 * IconButton — 44×44 circular icon-only touch target.
 * icon: 'chevron-left' | 'chevron-right' | 'close' | 'check' | 'info' | 'search' | 'menu'
 * surface: 'light' | 'dark'
 *
 * v2 changes:
 *   - CDN icon replaced with inline SVG (no network dependency)
 *   - label default '' removed — label is now required to prevent empty aria-label
 *   - deprecated --color-white → --color-bg-inverse
 *   - press feedback via global CSS button:active (styles.css), JS handlers removed
 */

const ICON_PATHS = {
  'chevron-left':  <polyline points="15 18 9 12 15 6" />,
  'chevron-right': <polyline points="9 6 15 12 9 18" />,
  'close':         <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
  'check':         <polyline points="20 6 9 17 4 12" />,
  'info':          <><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><circle cx="12" cy="8" r="0.5" fill="currentColor" /></>,
  'search':        <><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>,
  'menu':          <><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></>,
};

export function IconButton({ icon = 'chevron-left', label, onClick, surface = 'light', ...rest }) {
  if (!label) {
    console.warn('[DS] IconButton: `label` prop이 없습니다. 스크린리더 사용자가 이 버튼의 역할을 알 수 없습니다.');
  }

  const color = surface === 'dark' ? 'var(--color-bg-inverse)' : 'var(--color-text)';
  const path = ICON_PATHS[icon] ?? ICON_PATHS['chevron-left'];

  return (
    <button
      aria-label={label || undefined}
      onClick={onClick}
      style={{
        width: 44, height: 44,
        borderRadius: 'var(--radius-pill)',
        border: 'none', background: 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', color,
      }}
      {...rest}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22} aria-hidden="true">
        {path}
      </svg>
    </button>
  );
}

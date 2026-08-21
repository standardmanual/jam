import React from 'react';

/**
 * IconButton — 44×44 circular icon-only touch target.
 * icon: 'chevron-left' | 'chevron-right' | 'close' | 'check' | 'info' | 'search' | 'menu' | 'share'
 * surface: 'light' | 'dark'
 *
 * v2 changes:
 *   - CDN icon replaced with inline SVG (no network dependency)
 *   - label default '' removed — label is now required to prevent empty aria-label
 *   - deprecated --color-white → --color-bg-inverse
 *   - press feedback via global CSS button:active (styles.css), JS handlers removed
 *
 * v3 changes (20260821_004):
 *   - `disabled` prop added. This is a *soft* disable, not the native HTML `disabled`
 *     attribute: the button stays visually dimmed and `aria-disabled="true"` is set for
 *     assistive tech, but the native `disabled` attribute is never applied, so `onClick`
 *     keeps firing. This lets a caller show an explanatory popover/tooltip on click of a
 *     "disabled" action (e.g. "아직 획득하지 못한 배지예요") — a real HTML `disabled` button
 *     cannot receive click/focus events at all, which would make that pattern impossible.
 *     If a consumer needs a hard, non-interactive disabled button, pass native `disabled`
 *     via `...rest` is intentionally NOT supported here; use `disabled` for the soft variant.
 */

const ICON_PATHS = {
  'chevron-left':  <polyline points="15 18 9 12 15 6" />,
  'chevron-right': <polyline points="9 6 15 12 9 18" />,
  'close':         <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
  'check':         <polyline points="20 6 9 17 4 12" />,
  'info':          <><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><circle cx="12" cy="8" r="0.5" fill="currentColor" /></>,
  'search':        <><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>,
  'menu':          <><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></>,
  // 20260821_003: Material Symbols `ios_share`(원본 viewBox `0 -960 960 960`, 채워진 path)를
  // 이 컴포넌트의 24x24 좌표계로 옮겨 오기 위해 transform으로 변환한다.
  // SVG transform 리스트는 오른쪽 항목이 점에 먼저 적용되므로, "translate(0,960) 먼저 → scale(0.025) 나중"
  // 순서가 되려면 transform="scale(0.025) translate(0, 960)"로 써야 한다(오른쪽=translate가 먼저 적용됨).
  // 검증: (0,-960)→translate→(0,0)→scale→(0,0) / (960,0)→translate→(960,960)→scale→(24,24)
  //       (240,-80)→translate→(240,880)→scale→(6,22) / (480,-767)→translate→(480,193)→scale→(12,4.825)
  //       → 모두 0~24 범위 안에 들어옴을 확인.
  // 다른 아이콘과 달리 선(stroke) 기반이 아니라 면(fill) 기반 아이콘이라 fill/stroke를 이 path에서만 덮어쓴다.
  'share':         <path d="M240-80q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640h120v80H240v400h480v-400H600v-80h120q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240Zm200-240v-447l-64 64-56-57 160-160 160 160-56 57-64-64v447h-80Z" fill="currentColor" stroke="none" transform="scale(0.025) translate(0, 960)" />,
};

export function IconButton({ icon = 'chevron-left', label, onClick, surface = 'light', disabled = false, ...rest }) {
  if (!label) {
    console.warn('[DS] IconButton: `label` prop이 없습니다. 스크린리더 사용자가 이 버튼의 역할을 알 수 없습니다.');
  }

  const color = surface === 'dark' ? 'var(--color-bg-inverse)' : 'var(--color-text)';
  const path = ICON_PATHS[icon] ?? ICON_PATHS['chevron-left'];

  return (
    <button
      aria-label={label || undefined}
      aria-disabled={disabled || undefined}
      onClick={onClick}
      style={{
        width: 44, height: 44,
        borderRadius: 'var(--radius-pill)',
        border: 'none', background: 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer', color,
        opacity: disabled ? 0.35 : 1,
      }}
      {...rest}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22} aria-hidden="true">
        {path}
      </svg>
    </button>
  );
}

import React from 'react';

/** IconButton — 44x44 circular icon-only touch target, uses a Lucide CDN icon. */
export function IconButton({ icon = 'chevron-left', label = '', onClick, surface = 'light' }) {
  const colors = { light: 'var(--color-text)', dark: 'var(--color-white)' };
  return (
    <button
      aria-label={label}
      onClick={onClick}
      style={{
        width: 44, height: 44, borderRadius: 'var(--radius-pill)', border: 'none',
        background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', color: colors[surface],
      }}
    >
      <img src={`https://unpkg.com/lucide-static@latest/icons/${icon}.svg`} alt="" style={{ width: 22, height: 22, filter: surface === 'dark' ? 'invert(1)' : 'none' }} />
    </button>
  );
}

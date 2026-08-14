import React from 'react';

/** TopNav — sticky top bar with back chevron, title, optional right slot. */
export function TopNav({ title = '', showBack = true, onBack, rightSlot = null }) {
  return (
    <header style={{ position: 'sticky', top: 0, background: 'var(--color-bg)', zIndex: 30, borderBottom: '1px solid var(--color-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 12px', height: 56 }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
          {showBack && (
            <button aria-label="뒤로" onClick={onBack} style={{ width: 44, height: 44, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src="https://unpkg.com/lucide-static@latest/icons/chevron-left.svg" alt="" style={{ width: 22, height: 22 }} />
            </button>
          )}
          <h1 style={{ margin: 0, fontSize: 'var(--text-body)', lineHeight: 'var(--leading-body)', fontWeight: 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h1>
        </div>
        <div style={{ minWidth: 44, display: 'flex', justifyContent: 'flex-end' }}>{rightSlot}</div>
      </div>
    </header>
  );
}

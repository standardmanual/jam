import React from 'react';

/**
 * TopNav — sticky top bar with back button, title, optional right slot.
 * v2 changes:
 *   - h1 font-size: --text-body (16px) → --text-h4 (24px) — semantic/visual alignment
 *   - CDN icon replaced with inline SVG chevron-left
 *   - Uses IconButton-compatible inline SVG approach (no import needed here)
 *   - elevation: 보더/드롭섀도 없음(20260816_012) — 헤더와 본문 배경톤 차이만으로 구분
 */
export function TopNav({ title = '', showBack = true, onBack, rightSlot = null }) {
  return (
    <header style={{
      position: 'sticky', top: 0,
      background: 'var(--color-bg)',
      zIndex: 30,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '0 12px', height: 56,
      }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
          {showBack && (
            <button
              aria-label="뒤로"
              onClick={onBack}
              style={{
                width: 44, height: 44, border: 'none', background: 'transparent',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--color-text)', flexShrink: 0,
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22} aria-hidden="true">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}
          <h1 style={{
            margin: 0,
            fontSize: 'var(--text-h4)',
            lineHeight: 'var(--leading-h4)',
            fontWeight: 'var(--weight-h4)',
            letterSpacing: 'var(--tracking-h4)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            color: 'var(--color-text)',
          }}>
            {title}
          </h1>
        </div>
        <div style={{ minWidth: 44, display: 'flex', justifyContent: 'flex-end' }}>
          {rightSlot}
        </div>
      </div>
    </header>
  );
}

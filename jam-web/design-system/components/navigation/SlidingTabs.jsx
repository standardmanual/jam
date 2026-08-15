import React, { useRef } from 'react';

/**
 * SlidingTabs — horizontal scrollable pill tab bar for in-content navigation.
 * Distinct from TabBar (bottom navigation). Follows WAI-ARIA tablist pattern.
 *
 * props:
 *   tabs     — [{ key: string, label: string }]
 *   active   — key of the currently active tab
 *   onChange — (key: string) => void
 */
export function SlidingTabs({ tabs = [], active, onChange }) {
  const listRef = useRef(null);

  /* Keyboard navigation: ArrowLeft / ArrowRight move focus through tabs */
  const onKeyDown = (e, index) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const next = e.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : (index - 1 + tabs.length) % tabs.length;
      const buttons = listRef.current?.querySelectorAll('[role="tab"]');
      buttons?.[next]?.focus();
    }
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="탭 목록"
      style={{
        display: 'flex', gap: 'var(--spacing-8)',
        overflowX: 'auto', scrollSnapType: 'x mandatory',
        scrollbarWidth: 'none',
        padding: '2px 0 2px',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {tabs.map((tab, i) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange?.(tab.key)}
            onKeyDown={(e) => onKeyDown(e, i)}
            style={{
              flexShrink: 0,
              scrollSnapAlign: 'start',
              minHeight: 36,
              padding: '0 var(--spacing-16)',
              borderRadius: 'var(--radius-pill)',
              border: 'none',
              background: isActive ? 'var(--color-primary)' : 'var(--color-surface)',
              color: isActive ? 'var(--color-text-on-primary)' : 'var(--color-text-secondary)',
              fontSize: 'var(--text-small)',
              fontWeight: isActive ? 700 : 500,
              fontFamily: 'var(--font-family-base)',
              cursor: 'pointer',
              transition: [
                `background var(--duration-quick) var(--ease-smooth-out)`,
                `color var(--duration-quick) var(--ease-smooth-out)`,
              ].join(', '),
              whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
          </button>
        );
      })}
      <style>{`
        [role="tablist"]::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}

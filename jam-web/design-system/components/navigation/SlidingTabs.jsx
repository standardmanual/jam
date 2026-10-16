import React, { useRef } from 'react';

/**
 * SlidingTabs — horizontal scrollable pill tab bar for in-content navigation.
 * Distinct from TabBar (bottom navigation). Follows WAI-ARIA tablist pattern.
 *
 * props: items / value / onChange / variant / size / shape / block / outlined /
 * className / tabClassName / aria-label — matches the service implementation's
 * API (`src/components/ui/SlidingTabs.tsx`). MODULAR renders the active tab
 * as a filled pill (no sliding-pill animation — that lives in the service's
 * dedicated CSS transition, out of scope here).
 */

const SIZE_MIN_HEIGHT = { md: 30, lg: 44, xl: undefined };

export function SlidingTabs({
  items = [],
  value,
  onChange,
  variant = 'onSurface',
  size = 'lg',
  shape = 'pill',
  block = true,
  outlined = true,
  className,
  tabClassName,
  'aria-label': ariaLabel = '탭 목록',
}) {
  const listRef = useRef(null);

  // 팔레트(JAM 2.0 라이트, 티켓 20261015_2133) — 서비스 `src/components/ui/SlidingTabs.tsx`의 PALETTE와 같은 값이다.
  // 비활성 라벨은 두 팔레트 모두 --muted(흰 면·트랙 위 4.5:1 이상)다.
  const palette = variant === 'onCard'
    ? {
      barBg: outlined ? 'var(--surface)' : 'var(--background-secondary)',
      pillBg: 'var(--accent)',
      textMuted: 'var(--muted)',
      textActive: 'var(--accent-foreground)',
    }
    : {
      barBg: outlined ? 'var(--surface)' : 'var(--default)',
      pillBg: 'var(--background-inverse)',
      textMuted: 'var(--muted)',
      textActive: 'var(--snow)',
    };

  const borderRadius = shape === 'card' ? 'var(--radius-2xl)' : 'var(--radius-full)';
  const minHeight = SIZE_MIN_HEIGHT[size];

  /* Keyboard navigation: ArrowLeft / ArrowRight move focus through tabs */
  const onKeyDown = (e, index) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const next = e.key === 'ArrowRight'
        ? (index + 1) % items.length
        : (index - 1 + items.length) % items.length;
      const buttons = listRef.current?.querySelectorAll('[role="tab"]');
      buttons?.[next]?.focus();
    }
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      className={className}
      style={{
        display: 'flex', gap: 'var(--spacing-8)',
        overflowX: block ? 'visible' : 'auto', scrollSnapType: block ? undefined : 'x mandatory',
        scrollbarWidth: 'none',
        padding: '2px 0 2px',
        borderRadius,
        background: palette.barBg,
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {items.map((item, i) => {
        const isActive = item.key === value;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={item.ariaLabel}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange?.(item.key)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={tabClassName}
            style={{
              flex: block ? 1 : undefined,
              flexShrink: block ? undefined : 0,
              scrollSnapAlign: block ? undefined : 'start',
              minHeight,
              padding: '0 var(--spacing-16)',
              borderRadius,
              border: 'none',
              background: isActive ? palette.pillBg : 'transparent',
              color: isActive ? palette.textActive : palette.textMuted,
              fontSize: 'var(--text-sm)',
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
            {item.label}
          </button>
        );
      })}
      <style>{`
        [role="tablist"]::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}

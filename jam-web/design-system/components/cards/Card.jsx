import React from 'react';

/**
 * Card — surface container.
 * tone: 'default' | 'tint' | 'inverse'
 *
 * v2 changes:
 *   - tone 'white' → 'default' (white was rendering #1a1a1a — name/result mismatch fixed)
 *   - tone 'tint' now uses --color-bg-tint (was identical to 'white'/default)
 *   - tone 'inverse' uses --color-surface-inverse (white bg, dark text)
 *   - padding prop removed — uses --layout-card-padding token for global consistency
 *   - radius prop removed — always --radius-card (consumers override via style if needed)
 *   - ...rest spread added for className, data-*, aria-* passthrough
 *
 * 20260816_012: 보더 제거 — readme.md "보더 미사용" 원칙에 맞춰 프로덕션과 동기화.
 *   'default' 배경은 --color-surface-elevated로 한 단계 올려 보더 없이도
 *   페이지 캔버스(--color-surface)와 구분되게 했다.
 */
export function Card({ tone = 'default', children, className = '', style = {}, onClick, ...rest }) {
  const interactive = Boolean(onClick);

  const backgrounds = {
    default: {
      background: 'var(--color-surface-elevated)',
      color: 'var(--color-text)',
    },
    tint: {
      background: 'var(--color-bg-tint)',
      color: 'var(--color-text)',
    },
    inverse: {
      background: 'var(--color-surface-inverse)',
      color: 'var(--color-text-inverse)',
    },
  };

  return (
    <div
      className={className}
      onClick={onClick}
      role={rest.role ?? (interactive ? 'button' : undefined)}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.(e);
        }
      } : undefined}
      style={{
        borderRadius: 'var(--radius-card)',
        padding: 'var(--layout-card-padding)',
        cursor: interactive ? 'pointer' : undefined,
        ...backgrounds[tone] ?? backgrounds.default,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

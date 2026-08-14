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
 */
export function Card({ tone = 'default', children, className = '', style = {}, onClick, ...rest }) {
  const backgrounds = {
    default: {
      background: 'var(--color-surface)',
      color: 'var(--color-text)',
      border: '1px solid var(--color-border)',
    },
    tint: {
      background: 'var(--color-bg-tint)',
      color: 'var(--color-text)',
      border: '1px solid var(--color-border)',
    },
    inverse: {
      background: 'var(--color-surface-inverse)',
      color: 'var(--color-text-inverse)',
      border: 'none',
    },
  };

  return (
    <div
      className={className}
      onClick={onClick}
      style={{
        borderRadius: 'var(--radius-card)',
        padding: 'var(--layout-card-padding)',
        ...backgrounds[tone] ?? backgrounds.default,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

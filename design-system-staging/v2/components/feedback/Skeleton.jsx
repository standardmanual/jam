import React from 'react';

/**
 * Skeleton — inline loading placeholder with shimmer animation.
 * Hides from assistive technology (aria-hidden); surface loading state
 * to screen readers via a parent aria-live or role="status" region instead.
 *
 * @keyframes ds-shimmer lives in styles.css — no per-instance injection.
 *
 * width/height accept any CSS length value (px, %, rem, etc.).
 * borderRadius defaults to var(--radius-sm); pass 'var(--radius-pill)' for text lines
 * or '50%' for avatar placeholders.
 */
export function Skeleton({
  width = '100%',
  height = 16,
  borderRadius,
  className = '',
  style = {},
}) {
  return (
    <div
      className={className}
      aria-hidden="true"
      style={{
        width,
        height,
        borderRadius: borderRadius ?? 'var(--radius-sm)',
        background: 'var(--color-surface)',
        overflow: 'hidden',
        position: 'relative',
        ...style,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0, bottom: 0,
          left: '-100%',
          width: '100%',
          background: 'linear-gradient(90deg, transparent 0%, var(--color-border) 50%, transparent 100%)',
          animation: 'ds-shimmer 1.4s var(--ease-linear) infinite',
        }}
      />
    </div>
  );
}

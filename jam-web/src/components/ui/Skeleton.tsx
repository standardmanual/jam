import React from 'react';
import type { CSSProperties } from 'react';

export interface SkeletonProps {
  /** Any CSS length value — px, %, rem, etc. Defaults to '100%'. */
  width?: string | number;
  /** Any CSS length value. Defaults to 16. */
  height?: string | number;
  /** Defaults to var(--radius-lg). Pass '50%' for avatar, var(--radius-full) for text lines. */
  borderRadius?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * Skeleton — inline loading placeholder with shimmer animation.
 * Hides from assistive technology (aria-hidden); surface loading state
 * to screen readers via a parent aria-live or role="status" region instead.
 *
 * @keyframes ds-shimmer lives in styles.css — no per-instance injection.
 *
 * width/height accept any CSS length value (px, %, rem, etc.).
 * borderRadius defaults to var(--radius-lg); pass 'var(--radius-full)' for text lines
 * or '50%' for avatar placeholders.
 */
export function Skeleton({
  width = '100%',
  height = 16,
  borderRadius,
  className = '',
  style = {},
}: SkeletonProps) {
  return (
    <div
      className={className}
      aria-hidden="true"
      style={{
        width,
        height,
        borderRadius: borderRadius ?? 'var(--radius-lg)',
        background: 'var(--card-bg)',
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
          background: 'linear-gradient(90deg, transparent 0%, var(--border) 50%, transparent 100%)',
          animation: 'ds-shimmer 1.4s var(--ease-linear) infinite',
        }}
      />
    </div>
  );
}

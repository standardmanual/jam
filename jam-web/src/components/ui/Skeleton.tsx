import React from 'react';
import type { CSSProperties } from 'react';

export interface SkeletonProps {
  /** Any CSS length value — px, %, rem, etc. Defaults to '100%'. */
  width?: string | number;
  /** Any CSS length value. Defaults to 16. */
  height?: string | number;
  /** 모서리. 기본 'lg'. 'full'은 알약·캡슐 모양. */
  radius?: 'lg' | '2xl' | 'full';
  className?: string;
  style?: CSSProperties;
}

const RADIUS = {
  lg: 'var(--radius-lg)',
  '2xl': 'var(--radius-2xl)',
  full: 'var(--radius-full)',
} as const;

/**
 * Skeleton — inline loading placeholder with shimmer animation.
 * Hides from assistive technology (aria-hidden); surface loading state
 * to screen readers via a parent aria-live or role="status" region instead.
 *
 * @keyframes ds-shimmer lives in styles.css — no per-instance injection.
 *
 * width/height accept any CSS length value (px, %, rem, etc.).
 * radius는 'lg'(기본)·'2xl'·'full' 가운데 고른다.
 *
 * @summary 불러오는 동안 자리를 채우는 반짝이는 막대다. 프로필·캡슐 위젯·합성 결과 시트에서 쓴다.
 */
export function Skeleton({
  width = '100%',
  height = 16,
  radius = 'lg',
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
        borderRadius: RADIUS[radius],
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

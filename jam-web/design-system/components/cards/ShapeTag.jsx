import React from 'react';

const SHAPES = {
  rect:     { clipPath: 'none', borderRadius: 'var(--radius-input)' },
  pill:     { clipPath: 'none', borderRadius: 'var(--radius-pill)' },
  circle:   { clipPath: 'none', borderRadius: '50%' },
  dome:     { clipPath: 'none', borderRadius: '50% 50% 0 0' },
  triangle: { clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)', borderRadius: 0 },
  flag:     { clipPath: 'polygon(0 0, 88% 0, 100% 50%, 88% 100%, 0 100%)', borderRadius: 0 },
  hex:      { clipPath: 'polygon(6% 0, 94% 0, 100% 50%, 94% 100%, 6% 100%, 0% 50%)', borderRadius: 0 },
};

const TAG_COLORS = [
  'var(--color-tag-1)', 'var(--color-tag-2)', 'var(--color-tag-3)', 'var(--color-tag-4)',
  'var(--color-tag-5)', 'var(--color-tag-6)', 'var(--color-tag-7)', 'var(--color-tag-8)',
];

/**
 * ShapeTag — colored shape container for text labels or badge thumbnails.
 * shape: 'rect' | 'pill' | 'circle' | 'dome' | 'triangle' | 'flag' | 'hex'
 * surface: 'light' | 'dark' — text color context (matches Button/IconButton API)
 *
 * v2 changes:
 *   - dark: boolean → surface: 'light' | 'dark'  (API unified with Button/IconButton)
 *   - letterSpacing: --tracking-label applied for uppercase label legibility
 */
export function ShapeTag({
  shape = 'rect',
  colorIndex = 0,
  color,
  surface = 'dark',
  children,
  style = {},
  className = '',
}) {
  const s = SHAPES[shape] ?? SHAPES.rect;
  const bg = color ?? TAG_COLORS[colorIndex % TAG_COLORS.length];
  const textColor = surface === 'dark' ? 'var(--color-text)' : 'var(--color-text-inverse)';

  return (
    <div
      className={className}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: bg, color: textColor,
        fontSize: 'var(--text-caption)', fontWeight: 700,
        textTransform: 'uppercase', textAlign: 'center', lineHeight: 1.15,
        letterSpacing: 'var(--tracking-label)',
        padding: shape === 'triangle'
          ? '18px 10px 6px'
          : (shape === 'flag' || shape === 'hex') ? '10px 20px' : '10px 16px',
        minHeight: 44,
        boxSizing: 'border-box',
        ...s,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

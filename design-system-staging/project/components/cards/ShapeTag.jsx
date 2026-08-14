import React from 'react';

const SHAPES = {
  rect: { clipPath: 'none', borderRadius: 'var(--radius-input)' },
  pill: { clipPath: 'none', borderRadius: 'var(--radius-pill)' },
  circle: { clipPath: 'none', borderRadius: '50%' },
  dome: { clipPath: 'none', borderRadius: '50% 50% 0 0' },
  triangle: { clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)', borderRadius: 0 },
  flag: { clipPath: 'polygon(0 0, 88% 0, 100% 50%, 88% 100%, 0 100%)', borderRadius: 0 },
  hex: { clipPath: 'polygon(6% 0, 94% 0, 100% 50%, 94% 100%, 6% 100%, 0% 50%)', borderRadius: 0 },
};

const TAG_COLORS = ['var(--color-tag-1)', 'var(--color-tag-2)', 'var(--color-tag-3)', 'var(--color-tag-4)', 'var(--color-tag-5)', 'var(--color-tag-6)', 'var(--color-tag-7)', 'var(--color-tag-8)'];

/**
 * ShapeTag — a colored shape container. Two uses:
 *  1) text label chip (category tag, like Shop app's tag cloud)
 *  2) badge/thumbnail box — pass an icon/image as children instead of a label
 * `colorIndex` cycles through the tag palette; pass an explicit `color` to override.
 */
export function ShapeTag({ shape = 'rect', colorIndex = 0, color, dark = false, children, style = {}, className = '' }) {
  const s = SHAPES[shape] ?? SHAPES.rect;
  const bg = color ?? TAG_COLORS[colorIndex % TAG_COLORS.length];
  return (
    <div
      className={className}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: bg, color: dark ? '#fff' : '#111',
        fontSize: 12, fontWeight: 700, textTransform: 'uppercase', textAlign: 'center', lineHeight: 1.15,
        padding: shape === 'triangle' ? '18px 10px 6px' : shape === 'flag' || shape === 'hex' ? '10px 20px' : '10px 16px',
        minHeight: 44, boxSizing: 'border-box',
        ...s,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

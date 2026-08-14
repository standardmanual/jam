import React from 'react';

/** Card — surface container. tone: white (default) | tint (soft purple tint) | inverse (black) */
export function Card({ tone = 'white', padding = 24, radius = 'var(--radius-card)', children, className = '', style = {}, onClick }) {
  const backgrounds = {
    white: { background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)' },
    tint: { background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)' },
    inverse: { background: 'var(--color-bg-inverse)', color: 'var(--color-black)', border: 'none' },
  };
  return (
    <div
      className={className}
      onClick={onClick}
      style={{ borderRadius: radius, padding, ...backgrounds[tone], ...style }}
    >
      {children}
    </div>
  );
}

import React from 'react';

/**
 * Button — primary/outline/ghost pill button.
 * variant: primary (filled purple), outline (bordered), ghost (text-only)
 * surface: light (on white bg) | dark (on --color-bg-inverse bg)
 */
export function Button({ variant = 'primary', surface = 'light', fullWidth = false, disabled = false, children, onClick, type = 'button', className = '' }) {
  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    minHeight: 44, fontFamily: 'var(--font-family-base)', fontWeight: 400,
    fontSize: 'var(--text-body)', lineHeight: 'var(--leading-body)',
    borderRadius: 'var(--radius-pill)', padding: '12px 24px', cursor: disabled ? 'not-allowed' : 'pointer',
    border: '2px solid transparent', transition: 'transform 100ms ease', width: fullWidth ? '100%' : 'auto',
    opacity: disabled ? 0.4 : 1,
  };
  const variants = {
    light: {
      primary: { background: 'var(--color-primary)', color: 'var(--color-text-on-primary)' },
      secondary: { background: 'var(--color-surface-tint)', color: 'var(--color-text)' },
      ghost: { background: 'transparent', color: 'var(--color-primary)', padding: '12px 4px' },
    },
    dark: {
      primary: { background: 'var(--color-white)', color: 'var(--color-black)' },
      secondary: { background: 'rgba(255,255,255,0.16)', color: 'var(--color-white)' },
      ghost: { background: 'transparent', color: 'var(--color-white)', padding: '12px 4px' },
    },
  };
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={className}
      style={{ ...base, ...variants[surface][variant] }}
      onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.96)'; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
    >
      {children}
    </button>
  );
}

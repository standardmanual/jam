import React from 'react';

/**
 * Button — primary/secondary/ghost pill button.
 * variant: 'primary' | 'secondary' | 'ghost'
 * surface: 'light' | 'dark'  — background context the button sits on
 *
 * v2 changes:
 *   - onMouseDown/Up/Leave JS handlers removed — press feedback via CSS button:active in styles.css
 *   - loading prop added — shows inline spinner, auto-disables interaction
 *   - deprecated --color-surface-tint → --color-surface, --color-white → --color-bg-inverse
 */

/* DS-010: @keyframes ds-spin lives in styles.css — no per-instance <style> injection. */
function Spinner() {
  return (
    <svg
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
      strokeLinecap="round" width={16} height={16} aria-hidden="true"
      style={{ animation: 'ds-spin 0.8s linear infinite' }}
    >
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  );
}

export function Button({
  variant = 'primary',
  surface = 'light',
  fullWidth = false,
  disabled = false,
  loading = false,
  children,
  onClick,
  type = 'button',
  className = '',
  ...rest
}) {
  const isDisabled = disabled || loading;

  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    minHeight: 44,
    fontFamily: 'var(--font-family-base)', fontWeight: 600,
    fontSize: 'var(--text-body)', lineHeight: 'var(--leading-body)',
    borderRadius: 'var(--radius-pill)', padding: '12px 24px',
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    border: '2px solid transparent',
    transition: `transform var(--duration-micro) var(--ease-out), opacity 150ms ease`,
    width: fullWidth ? '100%' : 'auto',
    opacity: isDisabled ? 0.4 : 1,
  };

  const variants = {
    light: {
      primary:   { background: 'var(--color-primary)',    color: 'var(--color-text-on-primary)' },
      secondary: { background: 'var(--color-surface)',    color: 'var(--color-text)' },
      ghost:     { background: 'transparent',             color: 'var(--color-primary)', padding: '12px 4px' },
    },
    dark: {
      primary:   { background: 'var(--color-bg-inverse)', color: 'var(--color-text-inverse)' },
      secondary: { background: 'rgba(255,255,255,0.16)',  color: 'var(--color-bg-inverse)' },
      ghost:     { background: 'transparent',             color: 'var(--color-bg-inverse)', padding: '12px 4px' },
    },
  };

  return (
    <button
      type={type}
      disabled={isDisabled}
      onClick={onClick}
      className={className}
      aria-busy={loading ? true : undefined}
      style={{ ...base, ...variants[surface][variant] }}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

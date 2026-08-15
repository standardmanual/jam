import React from 'react';

/* Checkmark SVG — inline, no CDN */
const CheckIcon = () => (
  <svg
    viewBox="0 0 12 12" fill="none" stroke="currentColor"
    strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
    width={12} height={12} aria-hidden="true"
  >
    <polyline points="2 6 5 9 10 3" />
  </svg>
);

/**
 * Checkbox — label-wrapped checkbox with custom indicator.
 * Custom visual uses a positioned SVG overlay so the native <input> stays in
 * the accessibility tree; pointer-events on the overlay are disabled.
 * 44×44 touch target via the wrapping <label>.
 *
 * state: 'default' | 'error' | 'success'
 */
export function Checkbox({
  checked,
  onChange,
  label,
  id,
  name,
  disabled = false,
  state = 'default',
  style = {},
  ...rest
}) {
  const borderByState = {
    default: checked ? 'none' : '1.5px solid var(--color-border)',
    error: '2px solid var(--color-rarity-mythic)',
    success: checked ? 'none' : '2px solid var(--color-rarity-rare)',
  };

  return (
    <label
      htmlFor={id}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 12,
        minHeight: 44, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        userSelect: 'none',
        ...style,
      }}
    >
      {/* Native input — visually hidden but in a11y tree */}
      <input
        id={id}
        name={name}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        aria-invalid={state === 'error' ? true : undefined}
        style={{
          position: 'absolute',
          width: 1, height: 1,
          padding: 0, margin: -1,
          overflow: 'hidden',
          clip: 'rect(0,0,0,0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
        {...rest}
      />
      {/* Custom visual indicator */}
      <span
        aria-hidden="true"
        style={{
          flexShrink: 0,
          width: 20, height: 20,
          borderRadius: 'var(--radius-input)',
          border: borderByState[state] ?? borderByState.default,
          background: checked ? 'var(--color-primary)' : 'var(--color-bg-tint)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--color-text-on-primary)',
          transition: 'background var(--duration-quick) var(--ease-smooth-out)',
          boxSizing: 'border-box',
        }}
      >
        {checked && <CheckIcon />}
      </span>
      {label && (
        <span style={{ fontSize: 'var(--text-body)', color: 'var(--color-text)' }}>
          {label}
        </span>
      )}
    </label>
  );
}

import React from 'react';

/* Chevron icon — inline SVG, no CDN */
const ChevronDown = () => (
  <svg
    viewBox="0 0 16 16" fill="none" stroke="currentColor"
    strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
    width={16} height={16} aria-hidden="true"
    style={{ flexShrink: 0 }}
  >
    <polyline points="4 6 8 10 12 6" />
  </svg>
);

/**
 * Select — styled native <select>.
 * Uses appearance:none + inline chevron for cross-platform consistency.
 * Note: iOS Safari cannot fully restyle the native dropdown — the list
 * renders in the system picker. That is the intended behaviour for a
 * native-select approach; a custom listbox would be a separate component.
 *
 * options: [{ value: string, label: string }]
 * state: 'default' | 'error' | 'success'
 */
export function Select({
  value,
  onChange,
  options = [],
  placeholder,
  id,
  name,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedby,
  state = 'default',
  disabled = false,
  style = {},
  ...rest
}) {
  const borderByState = {
    default: '1px solid var(--color-border)',
    error: '2px solid var(--color-rarity-mystic)',
    success: '2px solid var(--color-rarity-rare)',
  };

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <select
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedby}
        aria-invalid={state === 'error' ? true : undefined}
        style={{
          width: '100%',
          height: 44,
          borderRadius: 'var(--radius-input)',
          border: borderByState[state] ?? borderByState.default,
          padding: '0 44px 0 20px',
          fontSize: 'var(--text-body)',
          lineHeight: 'var(--leading-body)',
          fontFamily: 'var(--font-family-base)',
          color: value ? 'var(--color-text)' : 'var(--color-text-secondary)',
          background: 'var(--color-bg-tint)',
          boxSizing: 'border-box',
          appearance: 'none',
          WebkitAppearance: 'none',
          opacity: disabled ? 0.4 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
          ...style,
        }}
        {...rest}
      >
        {placeholder && (
          <option value="" disabled hidden>{placeholder}</option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <span
        style={{
          position: 'absolute', right: 16,
          color: disabled ? 'var(--color-text-secondary)' : 'var(--color-text)',
          pointerEvents: 'none',
          display: 'flex', alignItems: 'center',
        }}
      >
        <ChevronDown />
      </span>
    </div>
  );
}

import React from 'react';

/**
 * Input — text field.
 * v2 changes:
 *   - id, name, aria-label, aria-describedby props added (WCAG 1.3.1, 4.1.2)
 *   - state: 'default' | 'error' | 'success' — visual validation feedback
 *   - ...rest spread allows any HTML input attribute to pass through
 *   - background changed from --color-white (deprecated) to --color-bg-tint
 *   - focus-visible handled globally by styles.css
 */
export function Input({
  placeholder = '',
  value,
  onChange,
  type = 'text',
  id,
  name,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedby,
  state = 'default',
  disabled = false,
  ...rest
}) {
  const borderByState = {
    default: '1px solid var(--color-border)',
    error: '2px solid var(--color-rarity-mythic)',
    success: '2px solid var(--color-rarity-rare)',
  };

  return (
    <input
      id={id}
      name={name}
      type={type}
      placeholder={placeholder}
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
        padding: '0 20px',
        fontSize: 'var(--text-body)',
        lineHeight: 'var(--leading-body)',
        fontFamily: 'var(--font-family-base)',
        color: 'var(--color-text)',
        background: 'var(--color-bg-tint)',
        boxSizing: 'border-box',
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? 'not-allowed' : 'text',
      }}
      {...rest}
    />
  );
}

import React from 'react';

/**
 * Textarea — multiline text field.
 * API mirrors Input: same state, disabled, aria props.
 * state: 'default' | 'error' | 'success'
 */
export function Textarea({
  placeholder = '',
  value,
  onChange,
  rows = 4,
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
    <textarea
      id={id}
      name={name}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      rows={rows}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedby}
      aria-invalid={state === 'error' ? true : undefined}
      style={{
        width: '100%',
        minHeight: 88,
        borderRadius: 'var(--radius-input)',
        border: borderByState[state] ?? borderByState.default,
        padding: '12px 20px',
        fontSize: 'var(--text-body)',
        lineHeight: 'var(--leading-body)',
        fontFamily: 'var(--font-family-base)',
        color: 'var(--color-text)',
        background: 'var(--color-bg-tint)',
        boxSizing: 'border-box',
        resize: 'vertical',
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? 'not-allowed' : 'text',
        ...style,
      }}
      {...rest}
    />
  );
}

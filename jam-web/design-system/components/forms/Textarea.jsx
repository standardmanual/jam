import React from 'react';

/**
 * Textarea — multiline text field.
 * API mirrors Input: same state, disabled, aria props.
 * state: 'default' | 'error' | 'success'
 *
 * 티켓 20261015_2133(2회): Input·Select와 같은 면(--surface) + 1px --field-border. 여러 줄은 캡슐(--field-radius 100px)이
 * 되면 모서리가 글자를 먹으므로 반경만 --radius-2xl(16px)이다. 오류 --danger, 성공 --success는 border 1px 위에
 * 같은 색 inset 링 1px를 더해 시각 2px로 만든다.
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
  const borderColorByState = {
    default: 'var(--field-border)',
    error: 'var(--danger)',
    success: 'var(--success)',
  };
  const ringByState = {
    default: 'none',
    error: 'inset 0 0 0 1px var(--danger)',
    success: 'inset 0 0 0 1px var(--success)',
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
        borderRadius: 'var(--radius-2xl)',
        border: `1px solid ${borderColorByState[state] ?? borderColorByState.default}`,
        boxShadow: ringByState[state] ?? ringByState.default,
        padding: '12px 20px',
        fontSize: 'var(--text-base)',
        lineHeight: 'var(--text-base--line-height)',
        fontFamily: 'var(--font-family-base)',
        color: 'var(--foreground)',
        background: 'var(--surface)',
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

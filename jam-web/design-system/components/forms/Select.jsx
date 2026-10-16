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
 *
 * 티켓 20261015_2133(2회): Input과 같은 면(--surface) + 1px --field-border + 캡슐(--field-radius). 오류 --danger,
 * 성공 --success는 border 1px 위에 같은 색 inset 링 1px를 더해 시각 2px로 만든다(두께가 변하면 글자가 움직인다).
 * 미선택 글자 --muted(흰 면 위 5.74:1), 선택됨 --foreground.
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
          borderRadius: 'var(--field-radius)',
          border: `1px solid ${borderColorByState[state] ?? borderColorByState.default}`,
          boxShadow: ringByState[state] ?? ringByState.default,
          padding: '0 44px 0 20px',
          fontSize: 'var(--text-base)',
          lineHeight: 'var(--text-base--line-height)',
          fontFamily: 'var(--font-family-base)',
          color: value ? 'var(--foreground)' : 'var(--muted)',
          background: 'var(--surface)',
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
          color: disabled ? 'var(--muted)' : 'var(--foreground)',
          pointerEvents: 'none',
          display: 'flex', alignItems: 'center',
        }}
      >
        <ChevronDown />
      </span>
    </div>
  );
}

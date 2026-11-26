import React from 'react';
import type { ChangeEventHandler, SelectHTMLAttributes } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  value?: string;
  onChange?: ChangeEventHandler<HTMLSelectElement>;
  options?: SelectOption[];
  placeholder?: string;
  id?: string;
  name?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
}

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
 *
 * 티켓 20261015_2133(2회): Input과 같은 면(--surface) + 1px --field-border + 캡슐(--field-radius).
 * 티켓 20261126_1635: 서비스가 쓰지 않는 오류·성공·비활성 표현을 지웠다(`disabled`는 네이티브 속성으로만 통과한다). 미선택 글자 --muted(흰 면 위 5.74:1), 선택됨 --foreground.
 *
 * @summary 캡슐 모양의 선택 상자다. 배지 목록의 필터·정렬과 미션 목록의 정렬에서 쓴다.
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
  style = {},
  ...rest
}: SelectProps) {
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <select
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedby}
        style={{
          width: '100%',
          height: 44,
          borderRadius: 'var(--field-radius)',
          border: '1px solid var(--field-border)',
          padding: '0 44px 0 20px',
          fontSize: 'var(--text-base)',
          lineHeight: 'var(--text-base--line-height)',
          fontFamily: 'var(--font-family-base)',
          color: value ? 'var(--foreground)' : 'var(--muted)',
          background: 'var(--surface)',
          boxSizing: 'border-box',
          appearance: 'none',
          WebkitAppearance: 'none',
          cursor: 'pointer',
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
          color: 'var(--foreground)',
          pointerEvents: 'none',
          display: 'flex', alignItems: 'center',
        }}
      >
        <ChevronDown />
      </span>
    </div>
  );
}

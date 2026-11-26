import React from 'react';
import type { ChangeEventHandler, CSSProperties, InputHTMLAttributes, ReactNode, Ref } from 'react';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  placeholder?: string;
  value?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  type?: string;
  id?: string;
  name?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  /** Visual validation state. 오류 --danger, 성공 --success (1px 테두리 + 같은 색 inset 링 1px로 시각 2px). */
  state?: 'default' | 'error' | 'success';
  disabled?: boolean;
  /** 입력칸 앞 슬롯(검색 아이콘, `@` 접두어 등) */
  leading?: ReactNode;
  /** 입력칸 뒤 슬롯(스피너, 제출 버튼 등) */
  trailing?: ReactNode;
  /** 슬롯 래퍼 DOM ref (오류 흔들림 애니메이션 등) */
  containerRef?: Ref<HTMLDivElement>;
  /** 슬롯 래퍼 className */
  containerClassName?: string;
  /** 슬롯 래퍼 인라인 style */
  containerStyle?: CSSProperties;
}

/**
 * Input — text field (캡슐형).
 * v2 changes:
 *   - id, name, aria-label, aria-describedby props added (WCAG 1.3.1, 4.1.2)
 *   - state: 'default' | 'error' | 'success' — visual validation feedback
 *   - ...rest spread allows any HTML input attribute to pass through
 *   - focus-visible handled globally by styles.css
 *
 * v3 changes (티켓 20261015_2133, 2회):
 *   - 면 --surface(흰) + 1px --field-border + --field-radius(캡슐). 서비스 UserSearchBar와 같은 레시피다.
 *     옛 --background-secondary 면은 크림 위 1.07:1이라 입력창이 보이지 않았다.
 *   - 오류 --danger, 성공 --success (옛 희귀도 색 제거). 상태 테두리는 border를 1px로
 *     두고 같은 색 inset 링 1px를 더해 시각 2px로 만든다 — border 두께가 1px → 2px로 변하면 안쪽 글자가
 *     1px 움직인다.
 *   - `surface="inverse"` 삭제.
 *
 * v4 changes (티켓 20261125_1444):
 *   - `leading` / `trailing` 슬롯(아이콘, `@` 접두어, 스피너, 우측 버튼)과 `containerRef` / `containerClassName` / `containerStyle` 추가.
 *     슬롯을 넘기지 않으면 기존과 동일한 단일 `<input>`을 그대로 렌더한다.
 *
 * @summary 캡슐 모양의 글자 입력칸이다. 프로필 편집·사용자 검색·온보딩·탈퇴 시트에서 쓴다.
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
  leading,
  trailing,
  containerRef,
  containerClassName = '',
  containerStyle,
  style,
  className,
  ...rest
}: InputProps) {
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

  const border = `1px solid ${borderColorByState[state] ?? borderColorByState.default}`;
  const boxShadow = ringByState[state] ?? ringByState.default;

  if (leading || trailing || containerRef || containerClassName || containerStyle) {
    return (
      <div
        ref={containerRef}
        className={containerClassName || undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          minHeight: 44,
          borderRadius: 'var(--field-radius)',
          border,
          boxShadow,
          padding: trailing ? '4px 4px 4px 16px' : '0 16px',
          background: 'var(--surface)',
          boxSizing: 'border-box',
          opacity: disabled ? 0.4 : 1,
          ...containerStyle,
        }}
      >
        {leading}
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
          className={className}
          style={{
            flex: 1,
            minWidth: 0,
            border: 'none',
            background: 'transparent',
            outline: 'none',
            padding: 0,
            fontSize: 'var(--text-base)',
            lineHeight: 'var(--text-base--line-height)',
            fontFamily: 'var(--font-family-base)',
            color: 'var(--foreground)',
            cursor: disabled ? 'not-allowed' : 'text',
            ...style,
          }}
          {...rest}
        />
        {trailing}
      </div>
    );
  }

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
      className={className}
      style={{
        width: '100%',
        height: 44,
        borderRadius: 'var(--field-radius)',
        border,
        boxShadow,
        padding: '0 20px',
        fontSize: 'var(--text-base)',
        lineHeight: 'var(--text-base--line-height)',
        fontFamily: 'var(--font-family-base)',
        color: 'var(--foreground)',
        background: 'var(--surface)',
        boxSizing: 'border-box',
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? 'not-allowed' : 'text',
        ...style,
      }}
      {...rest}
    />
  );
}

import React from 'react';

/**
 * Button — primary/secondary/ghost pill button.
 * variant: 'primary' | 'secondary' | 'ghost'
 * surface: 'light' | 'dark'  — background context the button sits on
 * size: 'md' (기본, 44px 최소 높이, iOS HIG 터치 타겟) | 'sm' (--scale-compact 배율 —
 *   기본 0.7 → 약 31px, 네비게이션 바 등 조밀한 컨텍스트 안에 놓이는 보조 액션 전용,
 *   본문 액션에는 쓰지 않는다, 20260824_010)
 *
 * v2 changes:
 *   - onMouseDown/Up/Leave JS handlers removed — press feedback via CSS button:active in styles.css
 *   - loading prop added — shows inline spinner, auto-disables interaction
 *   - deprecated --color-surface-tint → --color-surface, --color-white → --color-bg-inverse
 *   - size prop added (20260824_010) — 'sm'은 44px 터치 타겟 규칙의 명시적 예외(내비게이션
 *     바처럼 세로 공간이 44px로 고정된 컨텍스트에서만 사용할 것)
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
  size = 'md',
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

  // 'sm'은 --scale-compact(0.7, motion.css) 배율로 'md' 치수에서 도출한다 — 매직 넘버 대신
  // 토큰 기반 계산(20260824_010). 타이포는 스케일 곱셈이 아니라 기존 --text-caption 토큰을
  // 그대로 쓴다(임의 폰트 크기를 새로 만들지 않기 위함).
  const sizes = {
    md: { minHeight: 44, fontSize: 'var(--text-body)', lineHeight: 'var(--leading-body)', padding: '12px 24px' },
    sm: {
      minHeight: 'calc(44px * var(--scale-compact))',
      fontSize: 'var(--text-caption)',
      lineHeight: 'var(--leading-caption)',
      padding: 'calc(12px * var(--scale-compact)) calc(24px * var(--scale-compact))',
    },
  };

  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    fontFamily: 'var(--font-family-base)', fontWeight: 600,
    borderRadius: 'var(--radius-pill)',
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    border: '2px solid transparent',
    transition: `transform var(--duration-micro) var(--ease-out), opacity 150ms ease`,
    width: fullWidth ? '100%' : 'auto',
    opacity: isDisabled ? 0.4 : 1,
    ...sizes[size],
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

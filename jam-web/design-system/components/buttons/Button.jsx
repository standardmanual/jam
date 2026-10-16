import React from 'react';

/**
 * Button — pill button.
 * variant: 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost'
 * surface: 'light' | 'dark'  — background context the button sits on
 * size: 'md' (기본, 44px 최소 높이, iOS HIG 터치 타겟) | 'sm' (--scale-compact 배율 —
 *   기본 0.7 → 약 31px, 네비게이션 바 등 조밀한 컨텍스트 안에 놓이는 보조 액션 전용,
 *   본문 액션에는 쓰지 않는다, 20260824_010)
 *
 * v2 changes:
 *   - onMouseDown/Up/Leave JS handlers removed — press feedback via CSS button:active in styles.css
 *   - loading prop added — shows inline spinner, auto-disables interaction
 *   - deprecated tint·white 토큰 → 역할 토큰(--background, --background-inverse)
 *   - size prop added (20260824_010) — 'sm'은 44px 터치 타겟 규칙의 명시적 예외(내비게이션
 *     바처럼 세로 공간이 44px로 고정된 컨텍스트에서만 사용할 것)
 *
 * v3 changes (티켓 20261015_2131 재작업):
 *   - surface="dark"의 secondary·ghost 글자색을 --background-inverse → --snow로 바꿨다.
 *     dark는 --background-inverse 면 위에 놓이므로 이전 값은 배경과 같은 색(1.00~1.63:1)이었다.
 *     밝은 면(--background·--surface) 위에서는 surface="light"를 쓴다.
 *
 * v4 changes (티켓 20261015_2133, 2회):
 *   - 변형을 서비스 `src/components/ui/Button.tsx`와 같은 값으로 맞췄다
 *     (`src/components/ui/__tests__/buttonVariantPairs.test.tsx`가 고정). light 면 · 글자 · 1px 테두리:
 *       primary   --accent  · --accent-foreground · 투명
 *       secondary --default · --foreground        · 투명 (옛 --background 채움은 크림 바탕과 같은 색이라 사라졌다)
 *       danger    --danger  · --foreground        · 투명 (흰 글자는 3.57:1이라 쓰지 않는다)
 *       outline   투명      · --foreground        · --field-border
 *       ghost     투명      · --link              · 투명
 *   - 'danger'·'outline' 신설. 서비스 main primary(--background-inverse 검정 알약)는 사용자 결정(2026-10-16)으로
 *     서비스에만 남아 있다 — 같은 크림 바탕에서 이 light primary(--accent)와 색이 갈라진 알려진 임시 결함이다.
 *   - surface="dark"(반전 면 위, 스토리 전용): primary는 --snow 채움 + --foreground 글자, secondary는
 *     투명 + 1px --snow 테두리 + --snow 글자(옛 흰색 반투명 채움 제거), ghost는 --snow 글자.
 *     danger·outline은 dark 값을 따로 두지 않아 light 값을 쓴다.
 *   - 테두리 2px → 1px. 높이가 그대로이도록 세로 패딩을 +1px 했다(md 52px).
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
  // 토큰 기반 계산(20260824_010). 타이포는 스케일 곱셈이 아니라 기존 --text-xs 토큰을
  // 그대로 쓴다(임의 폰트 크기를 새로 만들지 않기 위함).
  // 세로 패딩은 테두리가 2px → 1px로 줄어든 만큼 +1px이다(높이 불변).
  const sizes = {
    md: { minHeight: 44, fontSize: 'var(--text-base)', lineHeight: 'var(--text-base--line-height)', padding: '13px 24px' },
    sm: {
      minHeight: 'calc(44px * var(--scale-compact))',
      fontSize: 'var(--text-xs)',
      lineHeight: 'var(--text-xs--line-height)',
      padding: 'calc(12px * var(--scale-compact) + 1px) calc(24px * var(--scale-compact))',
    },
  };

  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    fontFamily: 'var(--font-family-base)', fontWeight: 600,
    borderRadius: 'var(--radius-full)',
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    // 모든 변형에 1px 테두리를 둔다(외곽선 외에는 투명) — 변형이 바뀌어도 높이가 같다.
    borderWidth: 1, borderStyle: 'solid', borderColor: 'transparent',
    transition: `transform var(--duration-micro) var(--ease-out), opacity 150ms ease`,
    width: fullWidth ? '100%' : 'auto',
    opacity: isDisabled ? 0.4 : 1,
    ...sizes[size],
  };

  const variants = {
    light: {
      primary:   { background: 'var(--accent)',  color: 'var(--accent-foreground)' },
      secondary: { background: 'var(--default)', color: 'var(--foreground)' },
      danger:    { background: 'var(--danger)',  color: 'var(--foreground)' },
      outline:   { background: 'transparent',    color: 'var(--foreground)', borderColor: 'var(--field-border)' },
      ghost:     { background: 'transparent',    color: 'var(--link)', padding: '13px 4px' },
    },
    dark: {
      primary:   { background: 'var(--snow)',    color: 'var(--foreground)' },
      secondary: { background: 'transparent',    color: 'var(--snow)', borderColor: 'var(--snow)' },
      ghost:     { background: 'transparent',    color: 'var(--snow)', padding: '13px 4px' },
    },
  };

  // danger·outline은 dark 값이 없다 — light 값을 그대로 쓴다.
  const variantStyle = variants[surface]?.[variant] ?? variants.light[variant];

  return (
    <button
      type={type}
      disabled={isDisabled}
      onClick={onClick}
      className={className}
      aria-busy={loading ? true : undefined}
      style={{ ...base, ...variantStyle }}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

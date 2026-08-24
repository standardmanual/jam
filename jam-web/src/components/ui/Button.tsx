import { ButtonHTMLAttributes, forwardRef, type CSSProperties } from 'react'

/**
 * SuperHi Plus Button
 *
 * variant
 * - `primary` : pill 72px(--radius-pill-buttons), 채움 버튼
 * - `outline` : pill 50px(--radius-nav-buttons), 보더 없는 저강조 채움 버튼(20260816_012)
 * - `arrow`   : 화살표(→) 접두 텍스트 버튼. 배경/보더 없음, radius 16px, padding 24px
 *
 * surface = "이 버튼이 놓인 배경"
 * - `main`(기본, 다크 배경 위): primary는 흰색 채움 + 검정 텍스트,
 *   outline은 --color-surface-elevated 채움 + 흰 텍스트(20260816_012 — 보더 대신 배경톤)
 * - `sub`(라이트 배경 위): primary는 레드 채움 + 흰 텍스트,
 *   outline은 4% 블랙 틴트 채움 + 검정 텍스트(20260816_012 — 보더 대신 배경톤)
 *
 * 규칙: weight 400 단일, 최소 44×44pt 터치 영역, active: 스케일 축소 피드백,
 * 드롭섀도/그라데이션 금지. 보더는 명시적 요구가 있는 경우를 제외하고 사용하지 않는다
 * (20260816_012 — MODULAR readme.md "보더 미사용" 원칙에 맞춤).
 */
export type ButtonVariant =
  | 'primary'
  | 'outline'
  | 'arrow'
  /** @deprecated 레거시 네오브루탈 variant — outline으로 렌더됩니다. */
  | 'secondary'
  /** @deprecated 레거시 네오브루탈 variant — outline으로 렌더됩니다. */
  | 'ghost'
  /** @deprecated 레거시 네오브루탈 variant — outline으로 렌더됩니다. */
  | 'danger'

export type ButtonSurface = 'main' | 'sub'
/**
 * xs: --scale-compact(0.7, design-system/tokens/motion.css) 배율 — 44px 기준 약 31px
 * 최소 높이. 내비게이션 바처럼 세로 공간이 44px로 고정된 조밀한 컨텍스트 전용
 * (DS Button.jsx `size="sm"`과 동일 스펙, 20260824_010). 44px 터치 타겟 규칙의
 * 명시적 예외이므로 본문 액션에는 쓰지 않는다.
 */
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  surface?: ButtonSurface
  loading?: boolean
  fullWidth?: boolean
  /** @deprecated 'sm'/'md'/'lg'는 크기 위계를 타이포 스케일로만 표현합니다(패딩만 미세 조정).
   * 'xs'는 예외 — 44px 미만 높이가 필요한 조밀한 컨텍스트 전용으로 실제 높이가 줄어듭니다. */
  size?: ButtonSize
}

type ResolvedVariant = 'primary' | 'outline' | 'arrow'

const legacyVariantMap: Record<string, ResolvedVariant> = {
  secondary: 'outline',
  ghost: 'outline',
  danger: 'outline',
}

/**
 * DS v2 surface별 색상 클래스 (20260816_012: outline 보더 제거 → 배경톤 채움으로 대체).
 * - main (다크 배경 위): primary=흰 채움/검정 텍스트, outline=--color-surface-elevated 채움/흰 텍스트
 * - sub (라이트 surface 위): primary=레드 채움/흰 텍스트, outline=4% 블랙 틴트 채움/검정 텍스트
 */
const colorClasses: Record<ButtonSurface, Record<ResolvedVariant, string>> = {
  main: {
    primary: 'text-text-inverse',      // bg는 inline style(흰색)로 주입
    outline: 'text-text bg-surface-elevated',
    arrow: 'text-text',
  },
  sub: {
    primary: 'text-white',             // bg는 inline style(레드)로 주입
    outline: 'text-text-inverse bg-black/[0.04]',
    arrow: 'text-text-inverse',
  },
}

const primaryBgMap: Record<ButtonSurface, string> = {
  main: 'var(--color-surface-inverse)',  // 다크 배경 위 primary = 흰 pill
  sub:  'var(--color-primary)',          // 라이트 배경 위 primary = 레드 pill
}

const shapeClasses: Record<ResolvedVariant, string> = {
  primary:
    'rounded-[var(--radius-pill-buttons)] px-[var(--spacing-32)] py-[14px] text-[length:var(--text-body)] leading-[var(--leading-body)]',
  outline:
    'rounded-[var(--radius-nav-buttons)] px-[var(--spacing-24)] py-[14px] text-[length:var(--text-body)] leading-[var(--leading-body)]',
  arrow:
    'rounded-[var(--radius-buttons)] px-[var(--spacing-24)] py-[var(--spacing-24)] text-[length:var(--text-subheading)] leading-[var(--leading-subheading)]',
}

const sizePadding: Record<ButtonSize, string> = {
  xs: '',
  sm: 'px-[var(--spacing-16)] py-[10px] text-[length:var(--text-body-sm)]',
  md: '',
  lg: 'py-[18px]',
}

// xs는 Tailwind 클래스 우선순위 충돌(px-24/py-14 shapeClasses vs sizePadding)을 피하려고
// 인라인 style로 강제 적용한다 — 클래스 문자열 순서는 실제 CSS 우선순위를 보장하지 않는다.
// 치수는 DS Button.jsx의 'sm'과 동일하게 --scale-compact(0.7, design-system/tokens/motion.css)
// 배율로 md 기준(44px/12px/24px)에서 도출한다(매직 넘버 대신 토큰 계산, 20260824_010).
const xsStyle: CSSProperties = {
  minHeight: 'calc(44px * var(--scale-compact))',
  paddingTop: 'calc(12px * var(--scale-compact))',
  paddingBottom: 'calc(12px * var(--scale-compact))',
  paddingLeft: 'calc(24px * var(--scale-compact))',
  paddingRight: 'calc(24px * var(--scale-compact))',
  fontSize: 'var(--text-caption)',
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      surface = 'main',
      size = 'md',
      loading = false,
      fullWidth = false,
      disabled,
      className = '',
      children,
      style: styleProp,
      ...props
    },
    ref
  ) => {
    const resolved: ResolvedVariant =
      variant === 'primary' || variant === 'outline' || variant === 'arrow'
        ? variant
        : legacyVariantMap[variant] ?? 'outline'
    const isDisabled = disabled || loading

    const isPrimary = resolved === 'primary'

    // 사이즈/variant 기본 스타일 위에 호출부가 넘긴 style을 병합한다(완전 대체가 아님) —
    // TopNav/SyncButton 등이 배경색만 오버라이드하면서 xs 사이즈도 함께 쓸 수 있어야 한다.
    const mergedStyle: CSSProperties = {
      ...(isPrimary ? { backgroundColor: primaryBgMap[surface] } : {}),
      ...(size === 'xs' ? xsStyle : {}),
      ...styleProp,
    }

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={[
          // 최소 44×44pt 터치 영역 + weight 400 고정 (xs는 예외 — 인라인 style로 32px 강제)
          'inline-flex items-center justify-center gap-2 min-h-11 font-normal',
          'transition-transform duration-100',
          shapeClasses[resolved],
          colorClasses[surface][resolved],
          sizePadding[size],
          fullWidth ? 'w-full' : '',
          isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer active:scale-95',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        style={mergedStyle}
        {...props}
      >
        {loading && (
          <span className="w-4 h-4 border border-current border-t-transparent rounded-full animate-spin" />
        )}
        {resolved === 'arrow' && <span aria-hidden="true">&rarr;</span>}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
export default Button

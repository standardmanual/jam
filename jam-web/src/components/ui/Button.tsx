import { ButtonHTMLAttributes, forwardRef } from 'react'

/**
 * SuperHi Plus Button
 *
 * variant
 * - `primary` : pill 72px(--radius-pill-buttons), 채움 버튼
 * - `outline` : pill 50px(--radius-nav-buttons), 1px border만
 * - `arrow`   : 화살표(→) 접두 텍스트 버튼. 배경/보더 없음, radius 16px, padding 24px
 *
 * surface = "이 버튼이 놓인 배경"
 * - `main`(기본, 코발트 배경 위): primary는 아이스 채움 + 코발트 텍스트,
 *   outline은 1px 아이스 보더 + 아이스 텍스트
 * - `sub`(아이스 배경 위): primary는 코발트 채움 + 아이스 텍스트,
 *   outline은 1px 코발트 보더 + 코발트 텍스트
 *
 * 규칙: weight 400 단일, 최소 44×44pt 터치 영역, active: 스케일 축소 피드백,
 * 드롭섀도/그라데이션 금지(보더는 inset box-shadow로만).
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
export type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  surface?: ButtonSurface
  loading?: boolean
  fullWidth?: boolean
  /** @deprecated 크기 위계는 타이포 스케일로 표현합니다. 패딩만 미세 조정됩니다. */
  size?: ButtonSize
}

type ResolvedVariant = 'primary' | 'outline' | 'arrow'

const legacyVariantMap: Record<string, ResolvedVariant> = {
  secondary: 'outline',
  ghost: 'outline',
  danger: 'outline',
}

/**
 * DS v2 surface별 색상 클래스.
 * - main (다크 배경 위): primary=흰 채움/검정 텍스트, outline=흰 반투명 border/흰 텍스트
 * - sub (라이트 surface 위): primary=레드 채움/흰 텍스트, outline=다크 border/검정 텍스트
 */
const colorClasses: Record<ButtonSurface, Record<ResolvedVariant, string>> = {
  main: {
    primary: 'text-text-inverse',      // bg는 inline style(흰색)로 주입
    outline: 'text-text shadow-[inset_0_0_0_1px_rgba(255,255,255,0.3)]',
    arrow: 'text-text',
  },
  sub: {
    primary: 'text-white',             // bg는 inline style(레드)로 주입
    outline: 'text-text-inverse shadow-[inset_0_0_0_1px_var(--color-border-inverse)]',
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
  sm: 'px-[var(--spacing-16)] py-[10px] text-[length:var(--text-body-sm)]',
  md: '',
  lg: 'py-[18px]',
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

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={[
          // 최소 44×44pt 터치 영역 + weight 400 고정
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
        style={isPrimary ? { backgroundColor: primaryBgMap[surface] } : undefined}
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

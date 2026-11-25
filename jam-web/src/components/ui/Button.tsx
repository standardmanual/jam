import Link from 'next/link'
import { ButtonHTMLAttributes, forwardRef, type CSSProperties } from 'react'

/**
 * SuperHi Plus Button
 *
 * 이 파일이 Button의 유일한 구현이다(MODULAR 사본은 티켓 20261126_0720에서 지웠다). 변형별 면·글자·테두리
 * 토큰은 `__tests__/buttonVariantPairs.test.tsx`가 고정한다.
 *
 * variant (면 / 글자 / 1px 테두리)
 * - `primary`   : surface로 갈린다(아래)
 * - `secondary` : --btn-secondary / --foreground / 투명. 한 영역에 primary는 하나, 나머지는 secondary
 * - `danger`    : --danger / --snow / 투명. --danger가 검정이라 글자는 --snow다(primary와 같은 면, 문구·위치로 구분)
 * - `outline`   : --btn-secondary / --foreground / 투명. 외곽선이 없어 secondary와 같은 면이다(사용자 결정)
 * - `ghost`     : 투명 / --link / 투명
 * - `arrow`     : 화살표(→) 접두 텍스트 버튼. 배경·테두리 없음(투명 테두리), --foreground
 *
 * surface = "이 버튼이 놓인 배경".
 * - `main`(기본): primary는 --background-inverse 채움 + --snow 글자(검정 알약).
 * - `sub`: primary는 --accent 채움 + --accent-foreground 글자(밝은 배경 위 기본 primary)
 * - `dark`: 반전 면(--background-inverse 등 어두운 바탕) 위 전용.
 *   primary는 --snow 채움 + --foreground 글자, secondary는 투명 + 1px --snow 테두리 + --snow 글자, ghost는 --snow 글자.
 *
 * `href`를 넘기면 내부 경로는 Next `<Link>`, 외부(`external`·`http(s):`·`mailto:`·`#`)는 `<a>`로 렌더한다.
 *
 * 규칙: weight 400 단일, 최소 44×44pt 터치 영역, active: 스케일 축소 피드백,
 * 드롭섀도/그라데이션 금지. 모든 변형에 1px 테두리를 두고(외곽선 외에는 투명) 세로 패딩에서 그 두께를 뺀다 —
 * 변형이 바뀌어도 높이가 같다(md 52px).
 */
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost' | 'arrow'

export type ButtonSurface = 'main' | 'sub' | 'dark'
/**
 * xs: --scale-compact(0.7, design-system/tokens/motion.css) 배율 — 44px 기준 약 31px
 * 최소 높이. 내비게이션 바처럼 세로 공간이 44px로 고정된 조밀한 컨텍스트 전용이다(20260824_010).
 * 44px 터치 타겟 규칙의 명시적 예외이므로 본문 액션에는 쓰지 않는다.
 */
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  /** primary의 면(및 dark의 secondary·ghost)을 바꾼다. */
  surface?: ButtonSurface
  loading?: boolean
  fullWidth?: boolean
  /** 링크 버튼 경로. 내부 경로는 Next `<Link>`, 외부(`external`·`http(s):`·`mailto:`·`#`)는 `<a>`로 렌더한다. */
  href?: string
  /** `href`와 함께 쓰면 새 탭(`target="_blank" rel="noopener noreferrer"`)으로 연다. */
  external?: boolean
  /** @deprecated 'sm'/'md'/'lg'는 크기 위계를 타이포 스케일로만 표현합니다(패딩만 미세 조정).
   * 'xs'는 예외 — 44px 미만 높이가 필요한 조밀한 컨텍스트 전용으로 실제 높이가 줄어듭니다. */
  size?: ButtonSize
}

/** 면·글자·테두리 색 클래스. 테두리 두께(1px)는 base 클래스의 `border`가 맡는다. */
const colorClasses: Record<Exclude<ButtonVariant, 'primary'>, string> = {
  secondary: 'text-foreground bg-btn-secondary border-transparent',
  danger: 'text-snow bg-danger border-transparent',
  outline: 'text-foreground bg-btn-secondary border-transparent',
  ghost: 'text-link bg-transparent border-transparent',
  arrow: 'text-foreground bg-transparent border-transparent',
}

const primaryColorClasses: Record<ButtonSurface, string> = {
  main: 'text-snow bg-background-inverse border-transparent', // 검정 알약 유지(사용자 결정 2026-10-16)
  sub: 'text-accent-foreground bg-accent border-transparent', // 밝은 배경 위 primary = accent 알약
  dark: 'text-foreground bg-snow border-transparent', // 반전 면 위 알약 윤곽
}

const darkColorOverrides: Partial<Record<Exclude<ButtonVariant, 'primary'>, string>> = {
  secondary: 'text-snow bg-transparent border-snow',
  ghost: 'text-snow bg-transparent border-transparent',
}

function resolveColorClass(variant: ButtonVariant, surface: ButtonSurface): string {
  if (variant === 'primary') return primaryColorClasses[surface]
  if (surface === 'dark' && darkColorOverrides[variant]) return darkColorOverrides[variant]!
  return colorClasses[variant]
}

// 세로 패딩은 1px 테두리 두께를 뺀 값이다 — 14→13(md 52px 유지), arrow 24→23.
// arrow의 `py-5.75`(= 23px)는 임의값 `py-[23px]`가 아니라 스케일 유틸리티다: 임의값끼리는 값이 큰 쪽이 CSS에서
// 나중에 와서 이기는데, 옛 `py-6`처럼 스케일 유틸리티여야 sm·lg의 `py-[…]`가 이전처럼 arrow를 이긴다(높이 불변).
const pillShape = 'rounded-full px-6 py-[13px] text-base'

const shapeClasses: Record<ButtonVariant, string> = {
  primary: 'rounded-full px-8 py-[13px] text-base',
  secondary: pillShape,
  danger: pillShape,
  outline: pillShape,
  ghost: pillShape,
  arrow: 'rounded-full px-6 py-5.75 text-2xl',
}

const sizePadding: Record<ButtonSize, string> = {
  xs: '',
  sm: 'px-4 py-[9px] text-base',
  md: '',
  lg: 'py-[17px]',
}

// xs는 Tailwind 클래스 우선순위 충돌(px-24/py-13 shapeClasses vs sizePadding)을 피하려고
// 인라인 style로 강제 적용한다 — 클래스 문자열 순서는 실제 CSS 우선순위를 보장하지 않는다.
// 치수는 --scale-compact(0.7, design-system/tokens/motion.css) 배율로 md 기준(44px/12px/24px)에서
// 도출한다(매직 넘버 대신 토큰 계산, 20260824_010).
// 세로 패딩은 1px 테두리 두께를 뺀다(높이 불변).
const xsStyle: CSSProperties = {
  minHeight: 'calc(44px * var(--scale-compact))',
  paddingTop: 'calc(12px * var(--scale-compact) - 1px)',
  paddingBottom: 'calc(12px * var(--scale-compact) - 1px)',
  paddingLeft: 'calc(24px * var(--scale-compact))',
  paddingRight: 'calc(24px * var(--scale-compact))',
  fontSize: 'var(--text-xs)',
}

/** 정적 필(`ArticleView`의 href 없는 CTA 등)에서 버튼과 동일한 외형 클래스를 공유할 때 쓴다. */
export function getButtonClassName({
  variant = 'primary',
  surface = 'main',
  size = 'md',
  fullWidth = false,
  interactive = true,
  disabled = false,
  className = '',
}: {
  variant?: ButtonVariant
  surface?: ButtonSurface
  size?: ButtonSize
  fullWidth?: boolean
  interactive?: boolean
  disabled?: boolean
  className?: string
} = {}): string {
  return [
    // 최소 44×44pt 터치 영역 + weight 400 고정 (xs는 예외 — 인라인 style로 31px 강제)
    'inline-flex items-center justify-center gap-2 min-h-11 font-normal border',
    interactive ? 'transition-transform duration-100' : '',
    shapeClasses[variant],
    resolveColorClass(variant, surface),
    sizePadding[size],
    fullWidth ? 'w-full' : '',
    !interactive ? '' : disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer active:scale-95',
    className,
  ]
    .filter(Boolean)
    .join(' ')
}

function ButtonSpinner() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      width={16}
      height={16}
      aria-hidden="true"
      className="shrink-0 animate-spin"
    >
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  )
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      surface = 'main',
      size = 'md',
      loading = false,
      fullWidth = false,
      href,
      external = false,
      disabled,
      type = 'button',
      className = '',
      children,
      style: styleProp,
      'aria-busy': ariaBusyProp,
      ...props
    },
    ref
  ) => {
    const isDisabled = Boolean(disabled || loading)

    // 사이즈 기본 스타일 위에 호출부가 넘긴 style을 병합한다(완전 대체가 아님) —
    // 호출부가 xs 사이즈와 함께 style을 보탤 수 있어야 한다.
    const mergedStyle: CSSProperties = {
      ...(size === 'xs' ? xsStyle : {}),
      ...styleProp,
    }

    const classes = getButtonClassName({
      variant,
      surface,
      size,
      fullWidth,
      disabled: isDisabled,
      className,
    })

    const content = (
      <>
        {loading && <ButtonSpinner />}
        {variant === 'arrow' && <span aria-hidden="true">&rarr;</span>}
        {children}
      </>
    )

    if (href && !isDisabled) {
      const isExternalHref = external || /^(https?:|mailto:)/.test(href) || href === '#'
      const linkAriaLabel = props['aria-label']
      const linkId = props.id
      if (isExternalHref) {
        return (
          <a
            id={linkId}
            href={href}
            aria-label={linkAriaLabel}
            target={external ? '_blank' : undefined}
            rel={external ? 'noopener noreferrer' : undefined}
            className={classes}
            style={Object.keys(mergedStyle).length > 0 ? mergedStyle : undefined}
          >
            {content}
          </a>
        )
      }
      return (
        <Link
          id={linkId}
          href={href}
          aria-label={linkAriaLabel}
          className={classes}
          style={Object.keys(mergedStyle).length > 0 ? mergedStyle : undefined}
        >
          {content}
        </Link>
      )
    }

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={ariaBusyProp ?? (loading ? true : undefined)}
        className={classes}
        style={mergedStyle}
        {...props}
      >
        {content}
      </button>
    )
  }
)

Button.displayName = 'Button'
export default Button

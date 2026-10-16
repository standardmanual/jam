import { ButtonHTMLAttributes, forwardRef, type CSSProperties } from 'react'

/**
 * SuperHi Plus Button
 *
 * MODULAR `design-system/components/buttons/Button.jsx`와 병존하는 쌍이다. 변형별 면·글자·테두리
 * 토큰은 두 구현이 같은 값이어야 하고 `__tests__/buttonVariantPairs.test.tsx`가 그것을 고정한다.
 *
 * variant (면 / 글자 / 1px 테두리)
 * - `primary`   : surface로 갈린다(아래)
 * - `secondary` : --default / --foreground / 투명. 한 영역에 primary는 하나, 나머지는 secondary
 * - `danger`    : --danger / --foreground / 투명. 흰 글자는 3.57:1이라 쓰지 않는다
 * - `outline`   : 투명 / --foreground / --field-border. 옛 「테두리 없는 보조 채움」은 `secondary`로 옮겼다
 * - `ghost`     : 투명 / --link / 투명
 * - `arrow`     : 화살표(→) 접두 텍스트 버튼. 배경·테두리 없음(투명 테두리), --foreground
 *
 * surface = "이 버튼이 놓인 배경". primary에서만 색을 바꾼다. 나머지 변형은 surface와 무관하게 한 값이다
 * - `main`(기본): primary는 --background-inverse 채움 + --snow 글자(검정 알약). 결정 2(주 버튼 → accent)를
 *   이 면에는 적용하지 않기로 했다(사용자 결정 2026-10-16). MODULAR light primary(--accent)와 같은 크림 바탕에서
 *   색이 갈라진 채 남는다(알려진 임시 결함)
 * - `sub`: primary는 --accent 채움 + --accent-foreground 글자(MODULAR light primary와 같은 쌍)
 *
 * 규칙: weight 400 단일, 최소 44×44pt 터치 영역, active: 스케일 축소 피드백,
 * 드롭섀도/그라데이션 금지. 모든 변형에 1px 테두리를 두고(외곽선 외에는 투명) 세로 패딩에서 그 두께를 뺀다 —
 * 변형이 바뀌어도 높이가 같다(md 52px).
 */
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost' | 'arrow'

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
  /** primary의 면만 바꾼다(위 설명). secondary·danger·outline·ghost·arrow는 무시한다. */
  surface?: ButtonSurface
  loading?: boolean
  fullWidth?: boolean
  /** @deprecated 'sm'/'md'/'lg'는 크기 위계를 타이포 스케일로만 표현합니다(패딩만 미세 조정).
   * 'xs'는 예외 — 44px 미만 높이가 필요한 조밀한 컨텍스트 전용으로 실제 높이가 줄어듭니다. */
  size?: ButtonSize
}

/** 면·글자·테두리 색 클래스. 테두리 두께(1px)는 base 클래스의 `border`가 맡는다. */
const colorClasses: Record<Exclude<ButtonVariant, 'primary'>, string> = {
  secondary: 'text-foreground bg-default border-transparent',
  danger: 'text-foreground bg-danger border-transparent',
  outline: 'text-foreground bg-transparent border-field-border',
  ghost: 'text-link bg-transparent border-transparent',
  arrow: 'text-foreground bg-transparent border-transparent',
}

const primaryColorClasses: Record<ButtonSurface, string> = {
  main: 'text-snow bg-background-inverse border-transparent', // 검정 알약 유지(사용자 결정 2026-10-16)
  sub: 'text-accent-foreground bg-accent border-transparent', // 밝은 배경 위 primary = accent 알약
}

// 세로 패딩은 1px 테두리 두께를 뺀 값이다 — 14→13(md 52px 유지), arrow 24→23.
const pillShape = 'rounded-full px-6 py-[13px] text-base'

const shapeClasses: Record<ButtonVariant, string> = {
  primary: 'rounded-full px-8 py-[13px] text-base',
  secondary: pillShape,
  danger: pillShape,
  outline: pillShape,
  ghost: pillShape,
  arrow: 'rounded-full px-6 py-[23px] text-2xl',
}

const sizePadding: Record<ButtonSize, string> = {
  xs: '',
  sm: 'px-4 py-[9px] text-base',
  md: '',
  lg: 'py-[17px]',
}

// xs는 Tailwind 클래스 우선순위 충돌(px-24/py-13 shapeClasses vs sizePadding)을 피하려고
// 인라인 style로 강제 적용한다 — 클래스 문자열 순서는 실제 CSS 우선순위를 보장하지 않는다.
// 치수는 DS Button.jsx의 'sm'과 동일하게 --scale-compact(0.7, design-system/tokens/motion.css)
// 배율로 md 기준(44px/12px/24px)에서 도출한다(매직 넘버 대신 토큰 계산, 20260824_010).
// 세로 패딩은 1px 테두리 두께를 뺀다(높이 불변).
const xsStyle: CSSProperties = {
  minHeight: 'calc(44px * var(--scale-compact))',
  paddingTop: 'calc(12px * var(--scale-compact) - 1px)',
  paddingBottom: 'calc(12px * var(--scale-compact) - 1px)',
  paddingLeft: 'calc(24px * var(--scale-compact))',
  paddingRight: 'calc(24px * var(--scale-compact))',
  fontSize: 'var(--text-xs)',
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
    const isDisabled = disabled || loading

    // 사이즈 기본 스타일 위에 호출부가 넘긴 style을 병합한다(완전 대체가 아님) —
    // 호출부가 xs 사이즈와 함께 style을 보탤 수 있어야 한다.
    const mergedStyle: CSSProperties = {
      ...(size === 'xs' ? xsStyle : {}),
      ...styleProp,
    }

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={[
          // 최소 44×44pt 터치 영역 + weight 400 고정 (xs는 예외 — 인라인 style로 32px 강제)
          'inline-flex items-center justify-center gap-2 min-h-11 font-normal border',
          'transition-transform duration-100',
          shapeClasses[variant],
          variant === 'primary' ? primaryColorClasses[surface] : colorClasses[variant],
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
        {variant === 'arrow' && <span aria-hidden="true">&rarr;</span>}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
export default Button

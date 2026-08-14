import { HTMLAttributes, forwardRef } from 'react'
import { twMerge } from 'tailwind-merge'

/**
 * DS v2 Content Card — inverse surface (라이트 카드, 다크 배경 위 사용)
 *
 * - 배경: --color-surface-inverse (#ffffff) / 텍스트: --color-text-inverse (#000)
 * - radius 16px (--radius-cards), padding 24px (--spacing-24)
 * - elevation: 1px inset border(--color-border-inverse)만. 드롭섀도/블러/그라데이션 금지.
 * - 다크 배경(--color-bg = black) 위에서 라이트 카드를 유지하는 DS v2 "inverse" 패턴.
 */
interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** @deprecated 네오브루탈 시절 오프셋 섀도우 플래그. 아무 효과 없음(섀도우 금지). */
  glow?: boolean
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ glow: _glow, className = '', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={twMerge(
          'bg-surface-inverse text-text-inverse',
          'rounded-[var(--radius-cards)] p-[var(--spacing-24)]',
          'shadow-[inset_0_0_0_1px_var(--color-border-inverse)]',
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }
)

Card.displayName = 'Card'
export default Card

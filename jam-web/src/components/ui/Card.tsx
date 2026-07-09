import { HTMLAttributes, forwardRef } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  glow?: boolean
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ glow = false, className = '', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={[
          'rounded-2xl bg-white/5 border border-white/10 p-4',
          glow ? 'shadow-[0_0_16px_rgba(174,234,0,0.15)]' : '',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...props}
      >
        {children}
      </div>
    )
  }
)

Card.displayName = 'Card'
export default Card

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
          'rounded-3xl bg-jam-cream text-jam-ink border-[3px] border-jam-ink p-4',
          glow ? 'shadow-[5px_5px_0_0_#161616]' : 'shadow-[3px_3px_0_0_#161616]',
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

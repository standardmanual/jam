import { ButtonHTMLAttributes, forwardRef } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  fullWidth?: boolean
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-[#AEEA00] text-black font-bold hover:bg-[#c6ff00] active:scale-95',
  secondary:
    'bg-transparent border border-[#AEEA00] text-[#AEEA00] font-bold hover:bg-[#AEEA00]/10 active:scale-95',
  ghost:
    'bg-transparent text-white/70 hover:text-white hover:bg-white/10 active:scale-95',
  danger:
    'bg-red-600 text-white font-bold hover:bg-red-500 active:scale-95',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-lg',
  md: 'px-5 py-2.5 text-base rounded-xl',
  lg: 'px-6 py-3.5 text-lg rounded-2xl',
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
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
    const isDisabled = disabled || loading
    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={[
          'inline-flex items-center justify-center gap-2 transition-all duration-150',
          variantClasses[variant],
          sizeClasses[size],
          fullWidth ? 'w-full' : '',
          isDisabled ? 'opacity-50 cursor-not-allowed active:scale-100' : 'cursor-pointer',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...props}
      >
        {loading && (
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        )}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
export default Button

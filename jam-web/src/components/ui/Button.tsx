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
    'bg-jam-ink text-white border-[3px] border-jam-ink font-black shadow-[3px_3px_0_0_#161616] hover:shadow-[1px_1px_0_0_#161616] hover:translate-x-[2px] hover:translate-y-[2px] active:shadow-none active:translate-x-[3px] active:translate-y-[3px]',
  secondary:
    'bg-white text-jam-ink border-[3px] border-jam-ink font-black shadow-[3px_3px_0_0_#161616] hover:shadow-[1px_1px_0_0_#161616] hover:translate-x-[2px] hover:translate-y-[2px] active:shadow-none active:translate-x-[3px] active:translate-y-[3px]',
  ghost:
    'bg-transparent text-jam-ink/70 hover:text-jam-ink hover:bg-jam-ink/10 active:scale-95 font-bold',
  danger:
    'bg-red-600 text-white border-[3px] border-jam-ink font-black shadow-[3px_3px_0_0_#161616] active:shadow-none active:translate-x-[3px] active:translate-y-[3px]',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-xl',
  md: 'px-5 py-2.5 text-base rounded-2xl',
  lg: 'px-6 py-3.5 text-lg rounded-[1.75rem]',
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
          isDisabled ? 'opacity-40 cursor-not-allowed active:scale-100' : 'cursor-pointer',
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

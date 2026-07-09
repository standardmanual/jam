interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeClasses = {
  sm: 'w-4 h-4 border-2',
  md: 'w-8 h-8 border-2',
  lg: 'w-12 h-12 border-4',
}

export default function LoadingSpinner({ size = 'md', className = '' }: LoadingSpinnerProps) {
  return (
    <span
      role="status"
      aria-label="로딩 중"
      className={[
        'inline-block rounded-full border-[#AEEA00] border-t-transparent animate-spin',
        sizeClasses[size],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    />
  )
}

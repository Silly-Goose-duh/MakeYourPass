import { forwardRef, ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  fullWidth?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'sm', loading, fullWidth, disabled, children, ...props }, ref) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium rounded-md transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 focus-visible:ring-offset-void disabled:opacity-50 disabled:cursor-not-allowed min-h-[36px]'

    const variants = {
      primary:
        'bg-brand text-white hover:bg-brand-dark active:bg-brand-dark focus-visible:ring-brand',
      secondary:
        'bg-transparent border border-brand/40 text-brand-light hover:border-brand/60 hover:text-white focus-visible:ring-brand',
      outline:
        'bg-transparent border-2 border-brand text-brand-light hover:bg-brand/10 active:bg-brand/20 focus-visible:ring-brand',
      ghost:
        'bg-transparent text-brand-light hover:bg-brand/10 active:bg-brand/20 focus-visible:ring-brand',
      danger:
        'bg-error text-white hover:bg-red-500 active:bg-red-600 focus-visible:ring-error',
      success:
        'bg-success text-white hover:bg-emerald-500 active:bg-emerald-600 focus-visible:ring-success',
    }

    const sizes = {
      sm: 'px-4 py-1.5 text-sm gap-1.5',
      md: 'px-6 py-2 text-base gap-2',
      lg: 'px-8 py-2.5 text-lg gap-2.5',
    }

    return (
      <button
        ref={ref}
        className={cn(
          baseStyles,
          variants[variant],
          sizes[size],
          fullWidth && 'w-full',
          disabled && 'bg-[#4A4A5E] text-text-muted border-none',
          className,
        )}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </button>
    )
  },
)

Button.displayName = 'Button'

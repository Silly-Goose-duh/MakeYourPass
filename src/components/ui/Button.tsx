import { forwardRef, ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success' | 'gradient'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  loading?: boolean
  fullWidth?: boolean
  glow?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, fullWidth, glow, disabled, children, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed'

    const variants = {
      primary: 'bg-primary text-white hover:bg-primary-hover active:bg-primary-hover shadow-lg shadow-primary/25 focus-visible:ring-primary',
      secondary: 'bg-secondary text-white hover:bg-secondary-hover active:bg-secondary-hover shadow-lg shadow-secondary/25 focus-visible:ring-secondary',
      outline: 'border-2 border-primary text-primary hover:bg-primary-muted active:bg-primary/10 focus-visible:ring-primary',
      ghost: 'text-text-secondary hover:text-text-primary hover:bg-surface active:bg-surface-elevated focus-visible:ring-primary',
      danger: 'bg-error text-white hover:bg-red-500 active:bg-red-600 focus-visible:ring-error',
      success: 'bg-success text-white hover:bg-emerald-500 active:bg-emerald-600 focus-visible:ring-success',
      gradient: 'bg-gradient-to-r from-primary to-violet-600 text-white font-bold hover:opacity-90 active:opacity-80 shadow-xl focus-visible:ring-primary',
    }

    const sizes = {
      sm: 'px-4 py-2 text-sm gap-2',
      md: 'px-6 py-3 text-base gap-2.5',
      lg: 'px-8 py-4 text-lg gap-3',
      xl: 'px-10 py-5 text-xl gap-3',
    }

    const glowStyles: Record<string, string> = {
      primary: 'glow-primary',
      secondary: 'glow-accent',
      gradient: 'shadow-glow-primary',
    }

    return (
      <button
        ref={ref}
        className={cn(
          baseStyles,
          variants[variant],
          sizes[size],
          fullWidth && 'w-full',
          glow && glowStyles[variant],
          className
        )}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'

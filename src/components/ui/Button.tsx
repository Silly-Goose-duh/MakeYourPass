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
      'inline-flex items-center justify-center font-extrabold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D2E] disabled:opacity-50 disabled:cursor-not-allowed min-h-[38px] border-2 border-[#14110E]'

    const variants = {
      primary:
        'bg-[#FF4D2E] text-white shadow-[3px_3px_0_#14110E] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[5px_5px_0_#14110E] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_#14110E]',
      secondary:
        'bg-[#2D5BFF] text-white shadow-[3px_3px_0_#14110E] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[5px_5px_0_#14110E] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_#14110E]',
      outline:
        'bg-white text-[#14110E] shadow-[3px_3px_0_#14110E] hover:bg-[#FFF6D6] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_#14110E]',
      ghost:
        'bg-transparent border-transparent text-[#14110E] hover:bg-[#14110E] hover:text-white',
      danger:
        'bg-[#E2483B] text-white shadow-[3px_3px_0_#14110E] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[5px_5px_0_#14110E] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_#14110E]',
      success:
        'bg-[#14B87A] text-white shadow-[3px_3px_0_#14110E] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[5px_5px_0_#14110E] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_#14110E]',
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
          disabled && 'bg-[#B8B2A6] text-[#FFF] border-[#14110E] shadow-none cursor-not-allowed translate-x-0 translate-y-0',
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

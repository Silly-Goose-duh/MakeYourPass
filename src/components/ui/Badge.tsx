import { cn } from '@/lib/utils'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'primary' | 'outline'
  size?: 'sm' | 'md'
  dot?: boolean
}

export function Badge({
  className,
  variant = 'default',
  size = 'sm',
  dot = false,
  children,
  ...props
}: BadgeProps) {
  const baseStyles = 'inline-flex items-center gap-1.5 font-medium rounded-full'

  const variants = {
    default: 'bg-dark text-brand-light border border-brand/30',
    success: 'bg-success/10 text-success border border-success/30',
    warning: 'bg-warning/10 text-warning border border-warning/30',
    error: 'bg-error/10 text-error border border-error/30',
    primary: 'bg-brand text-white border border-brand',
    outline: 'bg-transparent text-brand-light border border-brand/40',
  }

  const sizes = {
    sm: 'px-2.5 py-0.5 text-[11px]',
    md: 'px-3 py-1 text-xs',
  }

  return (
    <span className={cn(baseStyles, variants[variant], sizes[size], className)} {...props}>
      {dot && (
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            variant === 'success' && 'bg-success',
            variant === 'warning' && 'bg-warning',
            variant === 'error' && 'bg-error',
            variant === 'primary' && 'bg-white',
            variant === 'default' && 'bg-text-muted',
            variant === 'outline' && 'bg-brand-light',
          )}
        />
      )}
      {children}
    </span>
  )
}

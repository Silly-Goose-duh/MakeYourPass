import { cn } from '@/lib/utils'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'primary' | 'accent' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  dot?: boolean
}

export function Badge({
  className,
  variant = 'default',
  size = 'md',
  dot = false,
  children,
  ...props
}: BadgeProps) {
  const baseStyles = 'inline-flex items-center gap-1.5 font-medium rounded-full'

  const variants = {
    default: 'bg-surface text-text-secondary border border-border',
    success: 'bg-success/10 text-success border border-success/20',
    warning: 'bg-warning/10 text-warning border border-warning/20',
    error: 'bg-error/10 text-error border border-error/20',
    info: 'bg-accent-teal/10 text-accent-teal border border-accent-teal/20',
    primary: 'bg-primary text-white border border-primary',
    accent: 'bg-secondary text-white border border-secondary',
    outline: 'bg-transparent text-text-secondary border border-border-light',
  }

  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
    lg: 'px-4 py-1.5 text-base',
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
            variant === 'info' && 'bg-accent-teal',
            variant === 'primary' && 'bg-surface',
            variant === 'accent' && 'bg-surface',
            variant === 'default' && 'bg-text-muted',
            variant === 'outline' && 'bg-text-muted'
          )}
        />
      )}
      {children}
    </span>
  )
}

import { cn } from '@/lib/utils'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'yellow' | 'pink' | 'cyan' | 'outline'
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
    default: 'bg-white/10 text-text-secondary border border-border',
    success: 'bg-green-500/20 text-green-400 border border-green-500/30',
    warning: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
    error: 'bg-red-500/20 text-red-400 border border-red-500/30',
    info: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
    yellow: 'bg-yellow-400 text-black border border-yellow-400',
    pink: 'bg-accent-pink/20 text-accent-pink border border-accent-pink/30',
    cyan: 'bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/30',
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
            variant === 'success' && 'bg-green-400',
            variant === 'warning' && 'bg-yellow-400',
            variant === 'error' && 'bg-red-400',
            variant === 'info' && 'bg-blue-400',
            variant === 'yellow' && 'bg-black',
            variant === 'default' && 'bg-text-muted',
            variant === 'outline' && 'bg-text-muted'
          )}
        />
      )}
      {children}
    </span>
  )
}
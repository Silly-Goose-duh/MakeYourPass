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
    default: 'bg-white text-[#14110E] border-2 border-[#14110E]',
    success: 'bg-[#14B87A]/15 text-[#0E8C5C] border-2 border-[#14B87A]',
    warning: 'bg-[#FFD23F]/20 text-[#8A6D00] border-2 border-[#FFD23F]',
    error: 'bg-[#FF4D2E]/15 text-[#C2331F] border-2 border-[#FF4D2E]',
    primary: 'bg-[#FF4D2E] text-white border-2 border-[#14110E]',
    outline: 'bg-transparent text-[#14110E] border-2 border-[#14110E]/40',
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

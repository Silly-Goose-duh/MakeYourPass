import { forwardRef, HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'glass' | 'glass-primary' | 'glass-accent' | 'elevated' | 'bordered'
  padding?: 'none' | 'sm' | 'md' | 'lg'
  hover?: boolean
  glow?: 'primary' | 'accent' | 'none'
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'default', padding = 'md', hover = false, glow = 'none', children, ...props }, ref) => {
    const baseStyles = 'rounded-2xl transition-all duration-300'

    const variants = {
      default: 'bg-surface border border-border shadow-sm',
      glass: 'glass',
      'glass-primary': 'glass-primary',
      'glass-accent': 'glass-accent',
      elevated: 'bg-surface border border-border shadow-lg',
      bordered: 'bg-surface border-2 border-border-light',
    }

    const paddings = {
      none: '',
      sm: 'p-4',
      md: 'p-6',
      lg: 'p-8',
    }

    const glows = {
      primary: 'shadow-[0_0_20px_rgba(99,102,241,0.12)]',
      accent: 'shadow-[0_0_20px_rgba(245,158,11,0.12)]',
      none: '',
    }

    const hoverStyles = hover
      ? 'hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10 hover:-translate-y-0.5 cursor-pointer'
      : ''

    return (
      <div
        ref={ref}
        className={cn(baseStyles, variants[variant], paddings[padding], glows[glow], hoverStyles, className)}
        {...props}
      >
        {children}
      </div>
    )
  }
)

Card.displayName = 'Card'

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('mb-4', className)} {...props} />
  )
)

CardHeader.displayName = 'CardHeader'

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('text-xl font-bold text-text-primary', className)} {...props} />
  )
)

CardTitle.displayName = 'CardTitle'

export const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-text-secondary mt-1', className)} {...props} />
  )
)

CardDescription.displayName = 'CardDescription'

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('', className)} {...props} />
  )
)

CardContent.displayName = 'CardContent'

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('mt-4 pt-4 border-t border-border', className)} {...props} />
  )
)

CardFooter.displayName = 'CardFooter'

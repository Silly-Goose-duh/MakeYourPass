import { forwardRef, HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'bordered'
  padding?: 'none' | 'sm' | 'md' | 'lg'
  hover?: boolean
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'default', padding = 'md', hover = false, children, ...props }, ref) => {
    const baseStyles = 'rounded-lg transition-all duration-150'

    const variants = {
      default: 'bg-white border-2 border-[#14110E] shadow-[4px_4px_0_#14110E]',
      bordered: 'bg-white border-2 border-[#14110E] shadow-[4px_4px_0_#14110E]',
    }

    const paddings = {
      none: '',
      sm: 'p-3',
      md: 'p-4',
      lg: 'p-6',
    }

    const hoverStyles = hover
      ? 'hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[7px_7px_0_#14110E] cursor-pointer'
      : ''

    return (
      <div ref={ref} className={cn(baseStyles, variants[variant], paddings[padding], hoverStyles, className)} {...props}>
        {children}
      </div>
    )
  },
)

Card.displayName = 'Card'

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('mb-3', className)} {...props} />
  ),
)

CardHeader.displayName = 'CardHeader'

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('text-base font-extrabold', className)} style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }} {...props} />
  ),
)

CardTitle.displayName = 'CardTitle'

export const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-sm mt-0.5', className)} style={{ color: '#4A4640' }} {...props} />
  ),
)

CardDescription.displayName = 'CardDescription'

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('', className)} {...props} />
  ),
)

CardContent.displayName = 'CardContent'

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('mt-3 pt-3 border-t-2 border-[#14110E]/15', className)} {...props} />
  ),
)

CardFooter.displayName = 'CardFooter'

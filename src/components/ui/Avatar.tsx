import React, { HTMLAttributes } from 'react'
import { cn, getInitials } from '@/lib/utils'

const sizeMap = {
  xs: 'h-6 w-6 text-xs',
  sm: 'h-8 w-8 text-sm',
  md: 'h-10 w-10 text-base',
  lg: 'h-12 w-12 text-lg',
  xl: 'h-16 w-16 text-xl',
  '2xl': 'h-24 w-24 text-2xl',
}

const statusSizeMap = {
  xs: 'h-1.5 w-1.5',
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5',
  lg: 'h-3 w-3',
  xl: 'h-4 w-4',
  '2xl': 'h-5 w-5',
}

export interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  src?: string | null
  alt?: string
  name?: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  shape?: 'circle' | 'square'
  status?: 'online' | 'offline' | 'busy' | 'away'
  statusPosition?: 'bottom-right' | 'top-right' | 'bottom-left' | 'top-left'
}

export function Avatar({
  className,
  src,
  alt,
  name,
  size = 'md',
  shape = 'circle',
  status,
  statusPosition = 'bottom-right',
  ...props
}: AvatarProps) {
  const shapeClasses = shape === 'circle' ? 'rounded-full' : 'rounded-xl'

  const statusColors = {
    online: 'bg-green-400',
    offline: 'bg-text-muted',
    busy: 'bg-red-400',
    away: 'bg-yellow-400',
  }

  const statusPositions = {
    'bottom-right': 'bottom-0 right-0',
    'top-right': 'top-0 right-0',
    'bottom-left': 'bottom-0 left-0',
    'top-left': 'top-0 left-0',
  }

  const fallbackContent = name ? getInitials(name) : '?'

  return (
    <div className={cn('relative inline-flex shrink-0', className)} {...props}>
      <div className={cn(sizeMap[size], shapeClasses, 'overflow-hidden bg-surface-elevated flex items-center justify-center')}>
        {src ? (
          <img
            src={src}
            alt={alt || name || 'Avatar'}
            className="h-full w-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        ) : (
          <span className="font-semibold text-text-primary">{fallbackContent}</span>
        )}
      </div>
      {status && (
        <span
          className={cn(
            'absolute rounded-full border-2 border-background',
            statusSizeMap[size],
            statusColors[status],
            statusPositions[statusPosition]
          )}
          aria-label={`Status: ${status}`}
        />
      )}
    </div>
  )
}

export function AvatarGroup({
  className,
  children,
  max = 5,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { max?: number }) {
  const kids = React.Children.toArray(children)
  const visible = kids.slice(0, max)
  const remaining = kids.length - max

  return (
    <div className={cn('flex items-center -space-x-2', className)} {...props}>
      {visible.map((child, index) => {
        const element = child as React.ReactElement<{ className?: string; key?: React.Key | null }>
        return React.cloneElement(element, {
          key: element.key ?? index,
          className: cn(element.props.className, 'ring-2 ring-background'),
        })
      })}
      {remaining > 0 && (
        <div
          className={cn(
            sizeMap.md,
            'rounded-full bg-surface-elevated border-2 border-background flex items-center justify-center font-medium text-text-secondary'
          )}
        >
          +{remaining}
        </div>
      )}
    </div>
  )
}
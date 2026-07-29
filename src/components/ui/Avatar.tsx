import React, { HTMLAttributes, useState } from 'react'
import { cn, getInitials } from '@/lib/utils'

const sizeMap = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-7 w-7 text-xs',
  md: 'h-9 w-9 text-sm',
  lg: 'h-11 w-11 text-base',
  xl: 'h-14 w-14 text-lg',
  '2xl': 'h-20 w-20 text-xl',
}

const statusSizeMap = {
  xs: 'h-1.5 w-1.5',
  sm: 'h-2 w-2',
  md: 'h-2 w-2',
  lg: 'h-2.5 w-2.5',
  xl: 'h-3 w-3',
  '2xl': 'h-4 w-4',
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
  const [broken, setBroken] = useState(false)
  const shapeClasses = shape === 'circle' ? 'rounded-full' : 'rounded-md'

  const statusColors = {
    online: 'bg-success',
    offline: 'bg-text-muted',
    busy: 'bg-error',
    away: 'bg-warning',
  }

  const statusPositions = {
    'bottom-right': 'bottom-0 right-0',
    'top-right': 'top-0 right-0',
    'bottom-left': 'bottom-0 left-0',
    'top-left': 'top-0 left-0',
  }

  const fallbackContent = name ? getInitials(name) : '?'
  const showImg = !!src && !broken

  return (
    <div className={cn('relative inline-flex shrink-0', className)} {...props}>
      <div
        className={cn(
          sizeMap[size],
          shapeClasses,
          'overflow-hidden bg-darker flex items-center justify-center border border-brand/20',
        )}
      >
        {showImg ? (
          <img
            src={src}
            alt={alt || name || 'Avatar'}
            className="h-full w-full object-cover"
            onError={() => setBroken(true)}
          />
        ) : (
          <span className="font-semibold text-brand-light">{fallbackContent}</span>
        )}
      </div>
      {status && (
        <span
          className={cn(
            'absolute rounded-full border-2 border-void',
            statusSizeMap[size],
            statusColors[status],
            statusPositions[statusPosition],
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
          className: cn(element.props.className, 'ring-2 ring-void'),
        })
      })}
      {remaining > 0 && (
        <div
          className={cn(
            sizeMap.md,
            'rounded-full bg-darker border border-brand/20 flex items-center justify-center font-medium text-brand-light text-xs',
          )}
        >
          +{remaining}
        </div>
      )}
    </div>
  )
}

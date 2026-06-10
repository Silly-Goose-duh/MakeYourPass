import { cn } from '@/lib/utils'

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'circular' | 'rectangular'
  width?: string | number
  height?: string | number
}

export function Skeleton({
  className,
  variant = 'text',
  width,
  height,
  ...props
}: SkeletonProps) {
  const baseStyles = 'animate-pulse bg-white/10 rounded'

  const variants = {
    text: 'h-4 w-full max-w-xs',
    circular: 'rounded-full',
    rectangular: 'rounded-xl',
  }

  return (
    <div
      className={cn(baseStyles, variants[variant], className)}
      style={{ width, height }}
      {...props}
    />
  )
}

export function SkeletonText({ lines = 3, className, ...props }: React.HTMLAttributes<HTMLDivElement> & { lines?: number }) {
  return (
    <div className={cn('space-y-3', className)} {...props}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} variant="text" width={i === lines - 1 ? '60%' : '100%'} />
      ))}
    </div>
  )
}

export function SkeletonCard({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('space-y-4 p-6', className)} {...props}>
      <div className="flex items-center gap-4">
        <Skeleton variant="circular" width={48} height={48} />
        <div className="flex-1 space-y-2">
          <Skeleton variant="text" width="40%" />
          <Skeleton variant="text" width="30%" />
        </div>
      </div>
      <Skeleton variant="rectangular" height={120} />
      <div className="flex gap-3">
        <Skeleton variant="text" width="80px" />
        <Skeleton variant="text" width="80px" />
      </div>
    </div>
  )
}

export function SkeletonTable({ rows = 5, columns = 4, className, ...props }: React.HTMLAttributes<HTMLDivElement> & { rows?: number; columns?: number }) {
  return (
    <div className={cn('space-y-3', className)} {...props}>
      <div className="flex gap-4">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} variant="text" width="100%" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="flex gap-4">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={i} variant="text" width="100%" />
          ))}
        </div>
      ))}
    </div>
  )
}
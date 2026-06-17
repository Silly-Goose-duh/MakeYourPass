import { Fragment, ReactNode, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface TooltipProps {
  children: ReactNode
  content: ReactNode
  position?: 'top' | 'bottom' | 'left' | 'right'
  delay?: number
  className?: string
  contentClassName?: string
}

export function Tooltip({
  children,
  content,
  position = 'top',
  delay = 200,
  className,
  contentClassName,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const showTooltip = () => {
    timeoutRef.current = setTimeout(() => setIsVisible(true), delay)
  }
  const hideTooltip = () => {
    clearTimeout(timeoutRef.current)
    setIsVisible(false)
  }

  const positions = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  }

  const arrows = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-darker',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-darker',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-darker',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-darker',
  }

  return (
    <Fragment>
      <span
        className={cn('relative inline-flex', className)}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
      >
        {children}
      </span>
      {isVisible && (
        <div
          className={cn(
            'fixed z-50 px-2.5 py-1.5 text-[11px] font-medium text-white bg-darker border border-brand/30 rounded',
            'animate-fade-in pointer-events-none',
            positions[position],
            contentClassName,
          )}
          role="tooltip"
        >
          {content}
          <div className={cn('absolute w-0 h-0 border-4 border-transparent', arrows[position])} />
        </div>
      )}
    </Fragment>
  )
}

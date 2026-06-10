import React, { useState, createContext, useContext, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface TabsContextType {
  activeValue: string
  onChange: (value: string) => void
  variant: 'line' | 'pills' | 'underline'
}

const TabsContext = createContext<TabsContextType | null>(null)

function useTabsContext() {
  const context = useContext(TabsContext)
  if (!context) {
    throw new Error('Tabs components must be used within Tabs')
  }
  return context
}

interface TabsProps {
  children: ReactNode
  defaultValue: string
  value?: string
  onChange?: (value: string) => void
  className?: string
  variant?: 'line' | 'pills' | 'underline'
}

export function Tabs({
  children,
  defaultValue,
  value,
  onChange,
  className,
  variant = 'line',
}: TabsProps) {
  const [internalValue, setInternalValue] = useState(defaultValue)
  const activeValue = value ?? internalValue

  const handleChange = (newValue: string) => {
    if (!value) setInternalValue(newValue)
    onChange?.(newValue)
  }

  const variants = ['line', 'pills', 'underline'] as const
  const safeVariant = variants.includes(variant as typeof variants[number]) ? variant : 'line'

  return (
    <TabsContext.Provider value={{ activeValue, onChange: handleChange, variant: safeVariant }}>
      <div className={cn('w-full', className)}>{children}</div>
    </TabsContext.Provider>
  )
}

interface TabsListProps {
  children: ReactNode
  className?: string
}

export function TabsList({ children, className }: TabsListProps) {
  const { variant } = useTabsContext()

  const variantStyles: Record<string, string> = {
    line: 'bg-surface border border-border rounded-xl p-1',
    pills: 'bg-transparent',
    underline: 'border-b border-border',
  }

  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      className={cn('flex gap-1', variantStyles[variant], className)}
    >
      {children}
    </div>
  )
}

interface TabsTriggerProps {
  value: string
  children: ReactNode
  disabled?: boolean
  className?: string
  icon?: ReactNode
}

export function TabsTrigger({
  value,
  children,
  disabled = false,
  className,
  icon,
}: TabsTriggerProps) {
  const { activeValue, onChange, variant } = useTabsContext()
  const isActive = activeValue === value

  const baseStyles = 'relative px-4 py-2.5 font-medium text-sm rounded-lg transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2'

  const variantStyles: Record<string, string> = {
    line: isActive
      ? 'bg-yellow-400 text-black shadow-md shadow-yellow-400/20'
      : 'text-text-secondary hover:text-text-primary hover:bg-white/5',
    pills: isActive
      ? 'bg-yellow-400 text-black shadow-md shadow-yellow-400/20'
      : 'text-text-secondary hover:text-text-primary hover:bg-white/5',
    underline: isActive
      ? 'text-yellow-400 border-b-2 border-yellow-400 -mb-px'
      : 'text-text-secondary hover:text-text-primary',
  }

  return (
    <button
      role="tab"
      aria-selected={isActive}
      type="button"
      onClick={() => !disabled && onChange(value)}
      disabled={disabled}
      className={cn(baseStyles, variantStyles[variant], className)}
    >
      {icon && <span className="h-4 w-4">{icon}</span>}
      {children}
    </button>
  )
}

interface TabsContentProps {
  value: string
  children: ReactNode
  className?: string
}

export function TabsContent({ value, children, className }: TabsContentProps) {
  const { activeValue } = useTabsContext()
  const isActive = activeValue === value

  if (!isActive) return null

  return (
    <div
      role="tabpanel"
      className={cn('animate-fade-in', className)}
    >
      {children}
    </div>
  )
}
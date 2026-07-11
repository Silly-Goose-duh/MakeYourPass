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
  if (!context) throw new Error('Tabs components must be used within Tabs')
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
    line: 'bg-[#FFFFFF] border-2 border-[#14110E] rounded-lg p-0.5',
    pills: 'bg-transparent',
    underline: 'border-b-2 border-[#14110E]/20',
  }
  return (
    <div role="tablist" aria-orientation="horizontal" className={cn('flex gap-0.5', variantStyles[variant], className)}>
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
  const baseStyles =
    'relative px-3 py-2 font-medium text-xs rounded-md transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5'

  const variantStyles: Record<string, string> = {
    line: isActive
      ? 'bg-[#FF4D2E] text-white border-2 border-[#14110E]'
      : 'text-[#14110E] hover:bg-[#14110E]/10 border-2 border-transparent',
    pills: isActive
      ? 'bg-[#FF4D2E] text-white border-2 border-[#14110E]'
      : 'text-[#14110E] hover:bg-[#14110E]/10 border-2 border-transparent',
    underline: isActive
      ? 'text-[#FF4D2E] border-b-2 border-[#FF4D2E] -mb-px'
      : 'text-[#14110E] hover:text-[#FF4D2E]',
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
      {icon && <span className="h-3.5 w-3.5">{icon}</span>}
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
  if (activeValue !== value) return null
  return (
    <div role="tabpanel" className={cn('pt-4', className)}>
      {children}
    </div>
  )
}

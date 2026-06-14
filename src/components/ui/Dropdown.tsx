import { Fragment, useEffect, useRef, useState, ReactNode } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './Button'

interface DropdownOption {
  value: string
  label: string
  icon?: ReactNode
  disabled?: boolean
  badge?: string
}

interface DropdownProps {
  options: DropdownOption[]
  value?: string
  placeholder?: string
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
  searchable?: boolean
  maxHeight?: string
}

export function Dropdown({
  options,
  value,
  placeholder = 'Select...',
  onChange,
  disabled = false,
  className,
  searchable = false,
  maxHeight = '240px',
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const selectedOption = options.find((opt) => opt.value === value)

  const handleOptionClick = (option: DropdownOption) => {
    if (!option.disabled) {
      onChange(option.value)
      setIsOpen(false)
      setSearchQuery('')
    }
  }

  return (
    <div ref={dropdownRef} className={cn('relative w-full', className)}>
      <Button
        ref={buttonRef}
        type="button"
        variant="outline"
        fullWidth
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className="justify-between text-left"
      >
        <span className={cn('truncate', value ? 'text-text-primary' : 'text-text-muted')}>
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown
          className={cn(
            'h-5 w-5 text-text-muted transition-transform',
            isOpen && 'rotate-180'
          )}
        />
      </Button>

      {isOpen && (
        <Fragment>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          <div
            className={cn(
              'absolute z-50 mt-1.5 w-full bg-surface-elevated border border-border rounded-xl glass-strong shadow-xl overflow-hidden animate-fade-in',
              `max-h-[${maxHeight}]`
            )}
          >
            {searchable && (
              <div className="p-3 border-b border-border">
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full px-3 py-2 bg-primary/50 border border-border rounded-lg text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  autoFocus
                />
              </div>
            )}
            <div className="overflow-y-auto p-1">
              {filteredOptions.length === 0 ? (
                <div className="px-3 py-4 text-center text-text-muted text-sm">
                  No options found
                </div>
              ) : (
                filteredOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleOptionClick(option)}
                    disabled={option.disabled}
                    className={cn(
                      'w-full px-3 py-2.5 rounded-lg text-left transition-colors',
                      'flex items-center gap-3',
                      value === option.value
                        ? 'bg-primary-muted text-primary'
                        : 'text-text-secondary hover:bg-white/5 hover:text-text-primary',
                      option.disabled && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    {option.icon && <span className="flex-shrink-0">{option.icon}</span>}
                    <span className="truncate font-medium">{option.label}</span>
                    {option.badge && (
                      <span className="ml-auto px-2 py-0.5 text-xs bg-white/10 rounded-full text-text-muted">
                        {option.badge}
                      </span>
                    )}
                    {value === option.value && (
                      <Check className="h-4 w-4 text-primary flex-shrink-0" />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </Fragment>
      )}
    </div>
  )
}
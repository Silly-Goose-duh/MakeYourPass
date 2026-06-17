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
    opt.label.toLowerCase().includes(searchQuery.toLowerCase()),
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
        type="button"
        variant="secondary"
        fullWidth
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className="justify-between text-left text-xs"
      >
        <span className={cn('truncate', value ? 'text-white' : 'text-text-muted')}>
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-text-muted transition-transform', isOpen && 'rotate-180')} />
      </Button>

      {isOpen && (
        <Fragment>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} aria-hidden="true" />
          <div
            className={cn('absolute z-50 mt-1 w-full bg-darker border border-brand/30 rounded-md overflow-hidden')}
            style={{ maxHeight }}
          >
            {searchable && (
              <div className="p-2 border-b border-brand/20">
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full px-2.5 py-1.5 bg-void border border-brand/20 rounded text-white text-xs placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand/50"
                  autoFocus
                />
              </div>
            )}
            <div className="overflow-y-auto p-1 max-h-[200px]">
              {filteredOptions.length === 0 ? (
                <div className="px-3 py-4 text-center text-text-muted text-xs">No options found</div>
              ) : (
                filteredOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleOptionClick(option)}
                    disabled={option.disabled}
                    className={cn(
                      'w-full px-2.5 py-2 rounded text-left transition-colors text-xs flex items-center gap-2',
                      value === option.value
                        ? 'bg-brand/10 text-brand-light'
                        : 'text-text-muted hover:bg-brand/5 hover:text-white',
                      option.disabled && 'opacity-50 cursor-not-allowed',
                    )}
                  >
                    {option.icon && <span className="flex-shrink-0">{option.icon}</span>}
                    <span className="truncate">{option.label}</span>
                    {option.badge && (
                      <span className="ml-auto px-1.5 py-0.5 text-[10px] bg-dark rounded text-text-muted">{option.badge}</span>
                    )}
                    {value === option.value && <Check className="h-3 w-3 text-brand flex-shrink-0" />}
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

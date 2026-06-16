import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react'
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, isToday, parse, getYear, getMonth, setYear, setMonth } from 'date-fns'

interface DatePickerProps {
  label: string
  value: string
  onChange: (value: string) => void
  minDate?: Date
  required?: boolean
}

const YEARS = Array.from({ length: 10 }, (_, i) => getYear(new Date()) + i - 1)
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function DatePicker({ label, value, onChange, minDate, required }: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [viewDate, setViewDate] = useState(() => value ? parse(value, 'yyyy-MM-dd', new Date()) : new Date())
  const [showYearPicker, setShowYearPicker] = useState(false)
  const [showMonthPicker, setShowMonthPicker] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const selectedDate = value ? parse(value, 'yyyy-MM-dd', new Date()) : null

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
        setShowYearPicker(false)
        setShowMonthPicker(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const monthStart = startOfMonth(viewDate)
  const monthEnd = endOfMonth(viewDate)
  const calStart = startOfWeek(monthStart)
  const calEnd = endOfWeek(monthEnd)
  const days = eachDayOfInterval({ start: calStart, end: calEnd })

  const handleSelect = (day: Date) => {
    onChange(format(day, 'yyyy-MM-dd'))
    setIsOpen(false)
  }

  const goToPrevMonth = () => setViewDate(prev => subMonths(prev, 1))
  const goToNextMonth = () => setViewDate(prev => addMonths(prev, 1))

  const handleYearSelect = (year: number) => {
    setViewDate(prev => setYear(prev, year))
    setShowYearPicker(false)
    setShowMonthPicker(true)
  }

  const handleMonthSelect = (month: number) => {
    setViewDate(prev => setMonth(prev, month))
    setShowMonthPicker(false)
  }

  const handleToday = () => {
    const now = new Date()
    setViewDate(now)
    onChange(format(now, 'yyyy-MM-dd'))
    setIsOpen(false)
  }

  const displayValue = selectedDate ? format(selectedDate, 'dd MMM yyyy') : ''

  return (
    <div ref={ref} className="relative">
      {/* Label */}
      {label && (
        <label className="block text-sm font-medium text-text-secondary mb-2">
          {label}{required && <span className="text-error ml-1">*</span>}
        </label>
      )}

      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-surface border border-border rounded-xl text-left transition-all hover:border-primary/40 focus:outline-none focus:border-primary/60"
      >
        <CalendarIcon className="h-5 w-5 text-primary flex-shrink-0" />
        <span className={displayValue ? 'text-text-primary' : 'text-text-muted'}>
          {displayValue || 'Select date'}
        </span>
      </button>

      {/* Calendar popover */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 mt-2 w-[320px] bg-surface rounded-xl border border-border shadow-lg shadow-black/40 overflow-hidden"
          >
            {/* Header with month/year navigation */}
            <div className="flex items-center justify-between p-3 border-b border-border">
              <button
                type="button"
                onClick={goToPrevMonth}
                className="p-1.5 rounded-lg hover:bg-primary-muted text-text-secondary hover:text-text-primary transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => { setShowMonthPicker(true); setShowYearPicker(false) }}
                  className="px-2 py-1 rounded-lg hover:bg-primary-muted text-sm font-semibold text-text-primary transition-colors"
                >
                  {format(viewDate, 'MMMM')}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowYearPicker(true); setShowMonthPicker(false) }}
                  className="px-2 py-1 rounded-lg hover:bg-primary-muted text-sm font-semibold text-text-secondary hover:text-text-primary transition-colors"
                >
                  {format(viewDate, 'yyyy')}
                </button>
              </div>

              <button
                type="button"
                onClick={goToNextMonth}
                className="p-1.5 rounded-lg hover:bg-primary-muted text-text-secondary hover:text-text-primary transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Year picker */}
            {showYearPicker && (
              <div className="grid grid-cols-4 gap-1 p-3 max-h-[240px] overflow-y-auto">
                {YEARS.map(year => (
                  <button
                    key={year}
                    type="button"
                    onClick={() => handleYearSelect(year)}
                    className={`py-2 rounded-lg text-sm font-medium transition-colors ${
                       getYear(viewDate) === year
                        ? 'bg-primary text-white'
                        : 'text-text-secondary hover:bg-primary-muted hover:text-text-primary'
                    }`}
                  >
                    {year}
                  </button>
                ))}
              </div>
            )}

            {/* Month picker */}
            {showMonthPicker && !showYearPicker && (
              <div className="grid grid-cols-3 gap-1 p-3">
                {MONTHS.map((month, idx) => (
                  <button
                    key={month}
                    type="button"
                    onClick={() => handleMonthSelect(idx)}
                    className={`py-2 rounded-lg text-sm font-medium transition-colors ${
                       getMonth(viewDate) === idx
                        ? 'bg-primary text-white'
                        : 'text-text-secondary hover:bg-primary-muted hover:text-text-primary'
                    }`}
                  >
                    {month.slice(0, 3)}
                  </button>
                ))}
              </div>
            )}

            {/* Calendar grid */}
            {!showYearPicker && !showMonthPicker && (
              <>
                {/* Day headers */}
                <div className="grid grid-cols-7 gap-0 p-2 pb-0">
                  {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                    <div key={d} className="h-8 flex items-center justify-center text-xs font-medium text-text-muted">
                      {d}
                    </div>
                  ))}
                </div>

                {/* Day cells */}
                <div className="grid grid-cols-7 gap-0 p-2 pt-0">
                  {days.map((day, idx) => {
                    const isCurrentMonth = isSameMonth(day, viewDate)
                    const isSelected = selectedDate && isSameDay(day, selectedDate)
                    const isTodayDay = isToday(day)
                    const isDisabled = minDate && day < minDate

                    return (
                      <button
                        key={idx}
                        type="button"
                        disabled={!!isDisabled}
                        onClick={() => handleSelect(day)}
                        className={`h-10 w-full rounded-lg text-sm font-medium transition-all flex items-center justify-center ${
                          isSelected
                            ? 'bg-primary text-white font-bold shadow-lg shadow-primary/20'
                            : isTodayDay && !isSelected
                            ? 'border border-primary/30 text-primary'
                            : isCurrentMonth
                            ? 'text-text-primary hover:bg-primary-muted'
                            : 'text-text-muted/40'
                        } ${isDisabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        {format(day, 'd')}
                      </button>
                    )
                  })}
                </div>

                {/* Footer with Today button */}
                <div className="flex items-center justify-between p-2 border-t border-border">
                  <button
                    type="button"
                    onClick={handleToday}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-primary hover:bg-primary-muted transition-colors"
                  >
                    Today
                  </button>
                  {selectedDate && (
                    <span className="text-xs text-text-muted">
                      {format(selectedDate, 'EEE, dd MMM')}
                    </span>
                  )}
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

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
      {label && (
        <label className="block text-xs font-medium text-brand-light mb-1.5">
          {label}{required && <span className="text-error ml-0.5">*</span>}
        </label>
      )}

      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2.5 px-3 py-2 bg-darker border border-brand/20 rounded text-left transition-colors hover:border-brand/40 focus:outline-none focus:border-brand/60 text-xs"
      >
        <CalendarIcon className="h-3.5 w-3.5 text-brand flex-shrink-0" />
        <span className={displayValue ? 'text-white' : 'text-text-muted'}>
          {displayValue || 'Select date'}
        </span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            className="absolute z-50 mt-1.5 w-[300px] bg-darker border border-brand/30 rounded-lg overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-2.5 border-b border-brand/20">
              <button
                type="button"
                onClick={goToPrevMonth}
                className="p-1 rounded hover:bg-brand/10 text-text-muted hover:text-white transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => { setShowMonthPicker(true); setShowYearPicker(false) }}
                  className="px-2 py-0.5 rounded hover:bg-brand/10 text-xs font-semibold text-white transition-colors"
                >
                  {format(viewDate, 'MMMM')}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowYearPicker(true); setShowMonthPicker(false) }}
                  className="px-2 py-0.5 rounded hover:bg-brand/10 text-xs font-semibold text-brand-light hover:text-white transition-colors"
                >
                  {format(viewDate, 'yyyy')}
                </button>
              </div>
              <button
                type="button"
                onClick={goToNextMonth}
                className="p-1 rounded hover:bg-brand/10 text-text-muted hover:text-white transition-colors"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Year picker */}
            {showYearPicker && (
              <div className="grid grid-cols-4 gap-0.5 p-2.5 max-h-[220px] overflow-y-auto">
                {YEARS.map(year => (
                  <button
                    key={year}
                    type="button"
                    onClick={() => handleYearSelect(year)}
                    className={`py-1.5 rounded text-xs font-medium transition-colors ${
                      getYear(viewDate) === year
                        ? 'bg-brand text-white'
                        : 'text-text-muted hover:bg-brand/10 hover:text-white'
                    }`}
                  >
                    {year}
                  </button>
                ))}
              </div>
            )}

            {/* Month picker */}
            {showMonthPicker && !showYearPicker && (
              <div className="grid grid-cols-3 gap-0.5 p-2.5">
                {MONTHS.map((month, idx) => (
                  <button
                    key={month}
                    type="button"
                    onClick={() => handleMonthSelect(idx)}
                    className={`py-1.5 rounded text-xs font-medium transition-colors ${
                      getMonth(viewDate) === idx
                        ? 'bg-brand text-white'
                        : 'text-text-muted hover:bg-brand/10 hover:text-white'
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
                <div className="grid grid-cols-7 gap-0 p-2 pb-0">
                  {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                    <div key={d} className="h-7 flex items-center justify-center text-[10px] font-medium text-text-muted">
                      {d}
                    </div>
                  ))}
                </div>
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
                        className={`h-8 w-full rounded text-xs font-medium transition-all flex items-center justify-center ${
                          isSelected
                            ? 'bg-brand text-white font-bold'
                            : isTodayDay && !isSelected
                            ? 'border border-brand/40 text-brand'
                            : isCurrentMonth
                            ? 'text-white hover:bg-brand/10'
                            : 'text-text-muted/30'
                        } ${isDisabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        {format(day, 'd')}
                      </button>
                    )
                  })}
                </div>
                <div className="flex items-center justify-between p-2 border-t border-brand/20">
                  <button
                    type="button"
                    onClick={handleToday}
                    className="px-2.5 py-1 rounded text-[11px] font-medium text-brand hover:bg-brand/10 transition-colors"
                  >
                    Today
                  </button>
                  {selectedDate && (
                    <span className="text-[11px] text-text-muted">
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

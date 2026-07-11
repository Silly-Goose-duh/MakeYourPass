import { forwardRef, InputHTMLAttributes, TextareaHTMLAttributes, LabelHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-bold mb-1.5" style={{ color: '#14110E' }}>
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'w-full px-3 py-2.5 border-2 text-sm',
            'transition-all duration-200 outline-none',
            'focus-visible:ring-2 focus-visible:ring-[#FF4D2E] focus-visible:border-[#FF4D2E]',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            error ? 'border-[#FF4D2E]' : 'border-[#14110E]',
            className,
          )}
          style={{ background: '#fff', color: '#14110E', fontFamily: 'Space Grotesk, sans-serif' }}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          {...props}
        />
        {error && (
          <p id={`${inputId}-error`} className="mt-1 text-xs font-bold" style={{ color: '#FF4D2E' }} role="alert">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={`${inputId}-hint`} className="mt-1 text-xs" style={{ color: '#4A4640' }}>
            {hint}
          </p>
        )}
      </div>
    )
  },
)

Input.displayName = 'Input'

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  hint?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const textareaId = id || label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={textareaId} className="block text-sm font-bold mb-1.5" style={{ color: '#14110E' }}>
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={cn(
            'w-full px-3 py-2.5 border-2 text-sm resize-y min-h-[80px]',
            'transition-all duration-200 outline-none',
            'focus-visible:ring-2 focus-visible:ring-[#FF4D2E] focus-visible:border-[#FF4D2E]',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            error ? 'border-[#FF4D2E]' : 'border-[#14110E]',
            className,
          )}
          style={{ background: '#fff', color: '#14110E', fontFamily: 'Space Grotesk, sans-serif' }}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `${textareaId}-error` : hint ? `${textareaId}-hint` : undefined}
          {...props}
        />
        {error && (
          <p id={`${textareaId}-error`} className="mt-1 text-xs font-bold" style={{ color: '#FF4D2E' }} role="alert">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={`${textareaId}-hint`} className="mt-1 text-xs" style={{ color: '#4A4640' }}>
            {hint}
          </p>
        )}
      </div>
    )
  },
)

Textarea.displayName = 'Textarea'

export const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, children, ...props }, ref) => (
    <label ref={ref} className={cn('block text-sm font-bold mb-1.5', className)} style={{ color: '#14110E' }} {...props}>
      {children}
    </label>
  ),
)

Label.displayName = 'Label'

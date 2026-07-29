import { Fragment, ReactNode, useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './Button'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  description?: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  showCloseButton?: boolean
  closeOnOverlayClick?: boolean
  closeOnEscape?: boolean
  /** Center title + body text (good for confirm dialogs) */
  centered?: boolean
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = 'md',
  showCloseButton = true,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  centered = false,
}: ModalProps) {
  useEffect(() => {
    if (!isOpen || !closeOnEscape) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, closeOnEscape, onClose])

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  if (!isOpen) return null

  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-2xl',
    full: 'max-w-[90vw]',
  }

  return (
    <Fragment>
      {/* Backdrop — full viewport */}
      <div
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px]"
        onClick={closeOnOverlayClick ? onClose : undefined}
        aria-hidden="true"
      />
      {/* Center stage — full viewport flex, size only on the card */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
        aria-describedby={description ? 'modal-description' : undefined}
      >
        <div
          className={cn(
            'pointer-events-auto w-full bg-darker border border-brand/30 rounded-lg overflow-hidden shadow-2xl',
            sizes[size]
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {(title || showCloseButton) && (
            <div
              className={cn(
                'flex items-start gap-3 p-4 border-b border-brand/20',
                centered ? 'flex-col items-center text-center relative' : 'justify-between'
              )}
            >
              <div className={cn(centered && 'w-full px-6')}>
                {title && (
                  <h2 id="modal-title" className="text-base font-semibold text-white">
                    {title}
                  </h2>
                )}
                {description && (
                  <p id="modal-description" className="mt-0.5 text-sm text-brand-light">
                    {description}
                  </p>
                )}
              </div>
              {showCloseButton && (
                <button
                  onClick={onClose}
                  aria-label="Close modal"
                  className={cn(
                    'p-1 text-text-muted hover:text-white transition-colors',
                    centered && 'absolute right-3 top-3'
                  )}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
          <div className={cn('p-4', centered && 'text-center')}>{children}</div>
        </div>
      </div>
    </Fragment>
  )
}

interface ConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'primary'
  loading?: boolean
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'primary',
  loading = false,
}: ConfirmModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm" centered>
      <p className="text-brand-light text-sm mb-5">{message}</p>
      <div className="flex justify-center gap-2">
        <Button variant="ghost" size="sm" onClick={onClose} disabled={loading}>
          {cancelText}
        </Button>
        <Button
          variant={variant === 'danger' ? 'danger' : 'primary'}
          size="sm"
          onClick={onConfirm}
          loading={loading}
        >
          {confirmText}
        </Button>
      </div>
    </Modal>
  )
}

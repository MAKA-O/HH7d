import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'

import { cn } from '@/lib/cn'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children?: ReactNode
  footer?: ReactNode
  className?: string
}

/** Модальное окно: затемнение без blur, панель-карточка, закрытие по Escape. */
export function Modal({ open, onClose, title, description, children, footer, className }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        aria-label="Закрыть окно"
        className="absolute inset-0 cursor-default bg-black/40"
        onClick={onClose}
        tabIndex={-1}
      />
      <div className={cn('relative w-full max-w-md rounded-lg border border-line bg-surface p-5 shadow-pop', className)}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-16 font-semibold text-fg">{title}</h2>
            {description ? <p className="mt-1 text-13 leading-relaxed text-fg-2">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-fg-3 transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {children ? <div className="mt-4">{children}</div> : null}
        {footer ? <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div> : null}
      </div>
    </div>
  )
}

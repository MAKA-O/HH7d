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

/** Простое модальное окно с затемнением и закрытием по Escape. */
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
    <div className="fixed inset-0 z-[90] flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Закрыть окно"
        className="absolute inset-0 cursor-default bg-ink-950/80 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div
        className={cn(
          'relative w-full max-w-md animate-fade-up rounded-2xl border border-white/10 bg-ink-800 p-5 shadow-2xl sm:p-6',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-50">{title}</h2>
            {description ? <p className="mt-1 text-sm text-slate-400">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/5 hover:text-slate-200"
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

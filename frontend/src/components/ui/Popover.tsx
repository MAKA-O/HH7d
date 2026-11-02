import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { cn } from '@/lib/cn'

interface PopoverRenderArgs {
  open: boolean
  toggle: () => void
}

interface PopoverProps {
  trigger: (args: PopoverRenderArgs) => ReactNode
  children: (close: () => void) => ReactNode
  align?: 'left' | 'right'
  panelClassName?: string
  className?: string
}

/** Лёгкий popover: закрытие по клику вне и Escape, позиционирование от триггера. */
export function Popover({ trigger, children, align = 'right', panelClassName, className }: PopoverProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setOpen(false), [])
  const toggle = useCallback(() => setOpen((value) => !value), [])

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) close()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, close])

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {trigger({ open, toggle })}
      {open ? (
        <div
          className={cn(
            'absolute z-50 mt-2 overflow-hidden rounded-lg border border-line bg-surface shadow-pop',
            align === 'right' ? 'right-0' : 'left-0',
            panelClassName,
          )}
        >
          {children(close)}
        </div>
      ) : null}
    </div>
  )
}

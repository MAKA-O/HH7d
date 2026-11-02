import { useRef, type KeyboardEvent, type ReactNode } from 'react'

import { cn } from '@/lib/cn'

export interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
}

interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
  className?: string
  fullWidth?: boolean
}

/** Переключатель-сегменты (радиогруппа): стрелки ←/→, aria-checked. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
  fullWidth = false,
}: SegmentedProps<T>) {
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  const select = (next: T) => {
    onChange(next)
    buttonRefs.current[next]?.focus()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = options.findIndex((option) => option.value === value)
    if (currentIndex < 0) return
    let nextIndex = currentIndex
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % options.length
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      nextIndex = (currentIndex - 1 + options.length) % options.length
    else return
    event.preventDefault()
    select(options[nextIndex].value)
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={cn('inline-flex rounded-md border border-line bg-surface-2 p-0.5', fullWidth && 'flex w-full', className)}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            ref={(node) => {
              buttonRefs.current[option.value] = node
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex h-10 items-center justify-center gap-1.5 rounded-[5px] px-3 text-13 font-medium transition-colors',
              fullWidth && 'flex-1',
              active
                ? 'bg-surface text-fg shadow-card dark:bg-line dark:shadow-none'
                : 'text-fg-2 hover:text-fg',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

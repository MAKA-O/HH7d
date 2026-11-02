import { useRef, type KeyboardEvent } from 'react'

import { cn } from '@/lib/cn'

export interface TabItem {
  id: string
  label: string
  count?: number
}

interface TabsProps {
  items: TabItem[]
  value: string
  onChange: (id: string) => void
  ariaLabel: string
  className?: string
}

/** Доступные табы: роли tablist/tab, навигация стрелками, Home/End. */
export function Tabs({ items, value, onChange, ariaLabel, className }: TabsProps) {
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = items.findIndex((item) => item.id === value)
    if (currentIndex < 0) return
    let nextIndex = currentIndex
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % items.length
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + items.length) % items.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = items.length - 1
    else return
    event.preventDefault()
    const nextItem = items[nextIndex]
    onChange(nextItem.id)
    buttonRefs.current[nextItem.id]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={cn('flex gap-1 overflow-x-auto border-b border-line scrollbar-none', className)}
    >
      {items.map((item) => {
        const active = item.id === value
        return (
          <button
            key={item.id}
            ref={(node) => {
              buttonRefs.current[item.id] = node
            }}
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.id)}
            className={cn(
              '-mb-px inline-flex h-10 shrink-0 items-center gap-2 border-b-2 px-3 text-13 font-medium transition-colors',
              active
                ? 'border-accent text-fg'
                : 'border-transparent text-fg-2 hover:border-line-strong hover:text-fg',
            )}
          >
            {item.label}
            {typeof item.count === 'number' ? (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-12 tabular-nums',
                  active ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-fg-3',
                )}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

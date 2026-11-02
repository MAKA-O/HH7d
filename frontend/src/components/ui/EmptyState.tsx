import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

interface EmptyStateProps {
  title: string
  description?: string
  icon?: LucideIcon
  action?: ReactNode
  className?: string
  /** Компактный вариант для встраивания в карточку. */
  compact?: boolean
}

/** Пустое состояние: пунктирная рамка, иконка, заголовок, пояснение и действие. */
export function EmptyState({ title, description, icon: Icon, action, className, compact = false }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed border-line-strong bg-surface-2/40 text-center',
        compact ? 'px-4 py-6' : 'px-6 py-10',
        className,
      )}
    >
      {Icon ? (
        <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-md border border-line bg-surface text-fg-3">
          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
      ) : null}
      <p className="text-14 font-medium text-fg">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-13 leading-relaxed text-fg-2">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

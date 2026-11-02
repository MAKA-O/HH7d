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

/** Единое пустое состояние: иконка, заголовок, пояснение и действие. */
export function EmptyState({ title, description, icon: Icon, action, className, compact = false }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] text-center',
        compact ? 'px-4 py-6' : 'px-6 py-12',
        className,
      )}
    >
      {Icon ? (
        <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-accent-300">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      ) : null}
      <p className="text-sm font-medium text-slate-200">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-slate-400">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

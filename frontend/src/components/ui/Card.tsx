import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from '@/lib/cn'

/** «Стеклянная» карточка — базовый контейнер контента. */
export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('surface p-5 sm:p-6', className)} {...rest}>
      {children}
    </div>
  )
}

interface CardHeaderProps {
  title: ReactNode
  description?: ReactNode
  icon?: ReactNode
  action?: ReactNode
  className?: string
}

/** Заголовок карточки с иконкой и действием справа. */
export function CardHeader({ title, description, icon, action, className }: CardHeaderProps) {
  return (
    <div className={cn('mb-4 flex items-start justify-between gap-4', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-accent-300">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-slate-100">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-slate-400">{description}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

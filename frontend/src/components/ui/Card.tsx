import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from '@/lib/cn'

/** Поверхность-карточка: радиус 8px, бордер, тень 0 1px 2px. Без внутренних отступов — их задаёт вызывающая сторона. */
export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('card', className)} {...rest}>
      {children}
    </div>
  )
}

interface CardHeaderProps {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}

/** Заголовок карточки: слева название и описание, справа действие. */
export function CardHeader({ title, description, action, className }: CardHeaderProps) {
  return (
    <div className={cn('mb-4 flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <h2 className="text-14 font-semibold text-fg">{title}</h2>
        {description ? <p className="mt-0.5 text-13 text-fg-2">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

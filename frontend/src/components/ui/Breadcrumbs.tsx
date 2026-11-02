import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import { cn } from '@/lib/cn'

export interface Crumb {
  label: string
  to?: string
}

interface BreadcrumbsProps {
  items: Crumb[]
  className?: string
}

/** Хлебные крошки: последний элемент — текущая страница (aria-current). */
export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  return (
    <nav aria-label="Хлебные крошки" className={cn('min-w-0', className)}>
      <ol className="flex min-w-0 items-center gap-1 text-13">
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          return (
            <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1">
              {index > 0 ? (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-fg-3" aria-hidden="true" />
              ) : null}
              {isLast ? (
                <span aria-current="page" className="truncate font-medium text-fg">
                  {item.label}
                </span>
              ) : item.to ? (
                <Link to={item.to} className="truncate text-fg-2 transition-colors hover:text-fg">
                  {item.label}
                </Link>
              ) : (
                <span className="truncate text-fg-2">{item.label}</span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

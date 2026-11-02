import { GraduationCap } from 'lucide-react'
import { Link } from 'react-router-dom'

import { cn } from '@/lib/cn'

interface BrandProps {
  to?: string
  className?: string
  /** Только знак, без подписи (для свёрнутого сайдбара). */
  iconOnly?: boolean
}

/** Логотип-ссылка: знак на акцентной плашке + название продукта. */
export function Brand({ to = '/', className, iconOnly = false }: BrandProps) {
  return (
    <Link to={to} className={cn('flex items-center gap-2.5', className)} aria-label="Тренажёр собеседований — на дашборд">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-accent-fg">
        <GraduationCap className="h-[18px] w-[18px]" aria-hidden="true" />
      </span>
      {iconOnly ? null : (
        <span className="leading-tight">
          <span className="block text-14 font-semibold text-fg">Тренажёр</span>
          <span className="block text-12 text-fg-3">Собеседования</span>
        </span>
      )}
    </Link>
  )
}

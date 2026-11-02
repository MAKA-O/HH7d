import { Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'

import { cn } from '@/lib/cn'

/** Логотип-ссылка на дашборд. */
export function Brand({ to = '/', className }: { to?: string; className?: string }) {
  return (
    <Link to={to} className={cn('flex items-center gap-3', className)}>
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent-500 to-violet-500 shadow-lg shadow-accent-700/30">
        <Sparkles className="h-5 w-5 text-white" aria-hidden="true" />
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold text-slate-50">Тренажёр</span>
        <span className="block text-[11px] uppercase tracking-wider text-slate-500">собеседований</span>
      </span>
    </Link>
  )
}

import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

type StatTone = 'accent' | 'emerald' | 'amber' | 'sky' | 'violet'

const TONE_CLASSES: Record<StatTone, string> = {
  accent: 'border-accent-400/20 bg-accent-500/10 text-accent-300',
  emerald: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
  amber: 'border-amber-500/20 bg-amber-500/10 text-amber-300',
  sky: 'border-sky-500/20 bg-sky-500/10 text-sky-300',
  violet: 'border-violet-500/20 bg-violet-500/10 text-violet-300',
}

interface StatCardProps {
  label: string
  value: ReactNode
  icon: LucideIcon
  hint?: string
  tone?: StatTone
  className?: string
}

/** Карточка метрики на дашборде. */
export function StatCard({ label, value, icon: Icon, hint, tone = 'accent', className }: StatCardProps) {
  return (
    <div className={cn('surface surface-hover p-5', className)}>
      <span className={cn('mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl border', TONE_CLASSES[tone])}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-50">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  )
}

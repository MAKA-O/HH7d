import { cn } from '@/lib/cn'

export type ProgressTone = 'accent' | 'emerald' | 'amber' | 'rose' | 'sky' | 'violet'

const TONE_CLASSES: Record<ProgressTone, string> = {
  accent: 'from-accent-500 to-violet-400',
  emerald: 'from-emerald-500 to-teal-400',
  amber: 'from-amber-500 to-orange-400',
  rose: 'from-rose-500 to-pink-400',
  sky: 'from-sky-500 to-cyan-400',
  violet: 'from-violet-500 to-fuchsia-400',
}

interface ProgressBarProps {
  /** Значение 0–100. */
  value: number
  tone?: ProgressTone
  size?: 'sm' | 'md'
  label?: string
  valueLabel?: string
  className?: string
}

/** Тонкий прогресс-бар с подписями. */
export function ProgressBar({ value, tone = 'accent', size = 'md', label, valueLabel, className }: ProgressBarProps) {
  const safeValue = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0))
  return (
    <div className={cn('space-y-1.5', className)}>
      {label || valueLabel ? (
        <div className="flex items-baseline justify-between gap-3 text-xs">
          <span className="truncate text-slate-300">{label}</span>
          <span className="shrink-0 font-medium text-slate-400">{valueLabel}</span>
        </div>
      ) : null}
      <div
        className={cn('w-full overflow-hidden rounded-full bg-white/10', size === 'sm' ? 'h-1.5' : 'h-2')}
        role="progressbar"
        aria-valuenow={Math.round(safeValue)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={cn('h-full rounded-full bg-gradient-to-r transition-all duration-500', TONE_CLASSES[tone])}
          style={{ width: `${safeValue}%` }}
        />
      </div>
    </div>
  )
}

/** Цвет прогресса по баллу 0–10. */
export function toneByScore(score: number | null | undefined): ProgressTone {
  if (score == null || Number.isNaN(score)) return 'accent'
  if (score >= 8) return 'emerald'
  if (score >= 6) return 'sky'
  if (score >= 4) return 'amber'
  return 'rose'
}

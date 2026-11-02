import { cn } from '@/lib/cn'

export type ProgressTone = 'accent' | 'positive' | 'caution' | 'negative'

const TONE_CLASSES: Record<ProgressTone, string> = {
  accent: 'bg-accent',
  positive: 'bg-positive',
  caution: 'bg-caution',
  negative: 'bg-negative',
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

/** Тонкий прогресс-бар без градиентов: сплошная заливка семантического цвета. */
export function ProgressBar({ value, tone = 'accent', size = 'md', label, valueLabel, className }: ProgressBarProps) {
  const safeValue = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0))
  const barHeight = size === 'sm' ? 'h-1' : 'h-1.5'
  return (
    <div className={cn('space-y-1.5', className)}>
      {label || valueLabel ? (
        <div className="flex items-baseline justify-between gap-3 text-13">
          <span className="truncate text-fg-2">{label}</span>
          <span className="shrink-0 font-medium tabular-nums text-fg">{valueLabel}</span>
        </div>
      ) : null}
      <div
        className={cn('w-full overflow-hidden rounded-full bg-surface-2', barHeight)}
        role="progressbar"
        aria-valuenow={Math.round(safeValue)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-500', TONE_CLASSES[tone])}
          style={{ width: `${safeValue}%` }}
        />
      </div>
    </div>
  )
}

/** Семантический цвет прогресса по баллу 0–10. */
export function toneByScore(score: number | null | undefined): ProgressTone {
  if (score == null || Number.isNaN(score)) return 'accent'
  if (score >= 8) return 'positive'
  if (score >= 6) return 'accent'
  if (score >= 4) return 'caution'
  return 'negative'
}

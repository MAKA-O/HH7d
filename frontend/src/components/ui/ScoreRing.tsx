import { cn } from '@/lib/cn'
import { formatScore } from '@/lib/format'

interface ScoreRingProps {
  /** Балл 0–10. */
  score: number | null | undefined
  size?: number
  strokeWidth?: number
  label?: string
  className?: string
}

function ringColor(score: number): string {
  if (score >= 8) return '#34d399'
  if (score >= 6) return '#38bdf8'
  if (score >= 4) return '#fbbf24'
  return '#fb7185'
}

/** Круговой индикатор балла 0–10. */
export function ScoreRing({ score, size = 112, strokeWidth = 9, label, className }: ScoreRingProps) {
  const safeScore = score == null || Number.isNaN(score) ? 0 : Math.min(10, Math.max(0, score))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - safeScore / 10)
  const color = ringColor(safeScore)

  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={strokeWidth} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 700ms ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums text-slate-50">{formatScore(score)}</span>
          <span className="text-[10px] uppercase tracking-wider text-slate-500">из 10</span>
        </div>
      </div>
      {label ? <span className="text-xs text-slate-400">{label}</span> : null}
    </div>
  )
}

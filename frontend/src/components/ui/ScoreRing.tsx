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

function toneClass(score: number): string {
  if (score >= 8) return 'text-positive'
  if (score >= 6) return 'text-accent'
  if (score >= 4) return 'text-caution'
  return 'text-negative'
}

/** Круговой индикатор балла 0–10 (сплошной штрих, без свечения). */
export function ScoreRing({ score, size = 88, strokeWidth = 7, label, className }: ScoreRingProps) {
  const safeScore = score == null || Number.isNaN(score) ? 0 : Math.min(10, Math.max(0, score))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - safeScore / 10)

  return (
    <div className={cn('flex flex-col items-center gap-1.5', className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-line"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className={toneClass(safeScore)}
            style={{ transition: 'stroke-dashoffset 600ms ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-20 font-semibold tabular-nums text-fg">{formatScore(score)}</span>
          <span className="text-12 text-fg-3">из 10</span>
        </div>
      </div>
      {label ? <span className="text-12 text-fg-3">{label}</span> : null}
    </div>
  )
}

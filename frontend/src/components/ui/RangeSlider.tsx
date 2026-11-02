import { cn } from '@/lib/cn'

interface RangeSliderProps {
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  ariaLabel: string
  label?: string
  valueLabel?: string
  id?: string
  className?: string
}

/** Нативный диапазон с системным фокусом и акцентным цветом; высота 40px для цели нажатия. */
export function RangeSlider({
  value,
  min,
  max,
  step = 1,
  onChange,
  ariaLabel,
  label,
  valueLabel,
  id,
  className,
}: RangeSliderProps) {
  return (
    <div className={cn('space-y-1', className)}>
      {label || valueLabel ? (
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-13 text-fg-2">{label}</span>
          <span className="text-13 font-medium tabular-nums text-fg">{valueLabel}</span>
        </div>
      ) : null}
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={ariaLabel}
        className="h-10 w-full cursor-pointer accent-accent"
      />
    </div>
  )
}

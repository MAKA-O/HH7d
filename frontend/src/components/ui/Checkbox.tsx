import { Check } from 'lucide-react'

import { cn } from '@/lib/cn'

interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
  id?: string
  disabled?: boolean
  className?: string
}

/** Чекбокс с кастомной отрисовкой и доступной целью нажатия (мин. 40px). */
export function Checkbox({ checked, onChange, label, description, id, disabled = false, className }: CheckboxProps) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex min-h-10 cursor-pointer items-start gap-2.5 rounded-md px-1.5 py-2 transition-colors hover:bg-surface-2',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <span className="relative mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="h-4 w-4 appearance-none rounded border border-line-strong bg-surface transition-colors checked:border-accent checked:bg-accent"
        />
        <Check
          className={cn('pointer-events-none absolute h-3 w-3 text-accent-fg', checked ? 'opacity-100' : 'opacity-0')}
          strokeWidth={3}
          aria-hidden="true"
        />
      </span>
      <span className="min-w-0">
        <span className="block text-13 text-fg">{label}</span>
        {description ? <span className="block text-12 text-fg-3">{description}</span> : null}
      </span>
    </label>
  )
}

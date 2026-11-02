import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

export type BadgeTone = 'neutral' | 'accent' | 'positive' | 'caution' | 'negative'

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'border-line bg-surface-2 text-fg-2',
  accent: 'border-accent/25 bg-accent-soft text-accent',
  positive: 'border-positive/25 bg-positive-soft text-positive',
  caution: 'border-caution/25 bg-caution-soft text-caution',
  negative: 'border-negative/25 bg-negative-soft text-negative',
}

interface BadgeProps {
  children: ReactNode
  tone?: BadgeTone
  className?: string
  icon?: ReactNode
}

/** Бейдж-статус: радиус 999px, 12px, семантические тона. */
export function Badge({ children, tone = 'neutral', className, icon }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-12 font-medium leading-4',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  )
}

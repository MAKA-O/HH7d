import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'violet'

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'border-white/10 bg-white/5 text-slate-300',
  accent: 'border-accent-400/25 bg-accent-500/10 text-accent-200',
  success: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
  warning: 'border-amber-500/25 bg-amber-500/10 text-amber-300',
  danger: 'border-rose-500/25 bg-rose-500/10 text-rose-300',
  info: 'border-sky-500/25 bg-sky-500/10 text-sky-300',
  violet: 'border-violet-500/25 bg-violet-500/10 text-violet-300',
}

interface BadgeProps {
  children: ReactNode
  tone?: BadgeTone
  className?: string
  icon?: ReactNode
}

/** Небольшой цветной бейдж для статусов, сложности и типов. */
export function Badge({ children, tone = 'neutral', className, icon }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-5',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  )
}

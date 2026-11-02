import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface StatCardProps {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: LucideIcon
}

/** KPI-карточка дашборда: подпись, значение, пояснение и нейтральная иконка. */
export function StatCard({ label, value, hint, icon: Icon }: StatCardProps) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-13 text-fg-2">{label}</p>
        {Icon ? <Icon className="h-4 w-4 shrink-0 text-fg-3" aria-hidden="true" /> : null}
      </div>
      <p className="mt-2 text-24 font-semibold tabular-nums text-fg">{value}</p>
      {hint ? <p className="mt-1 text-12 text-fg-3">{hint}</p> : null}
    </div>
  )
}

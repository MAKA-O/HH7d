import { cn } from '@/lib/cn'

interface SkeletonProps {
  className?: string
}

/** Базовый скелетон-блок для состояния загрузки. */
export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn('animate-pulse rounded-lg bg-white/5', className)} aria-hidden="true" />
}

interface SkeletonTextProps {
  lines?: number
  className?: string
}

export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton key={index} className={cn('h-3.5', index === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  )
}

/** Скелетон карточки со статистикой. */
export function SkeletonStatCard() {
  return (
    <div className="surface space-y-3 p-5">
      <Skeleton className="h-9 w-9 rounded-xl" />
      <Skeleton className="h-3.5 w-24" />
      <Skeleton className="h-7 w-16" />
    </div>
  )
}

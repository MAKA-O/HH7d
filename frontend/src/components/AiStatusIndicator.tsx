import { Link } from 'react-router-dom'

import { useAiStatus } from '@/context/AiStatusContext'
import { cn } from '@/lib/cn'

interface AiStatusIndicatorProps {
  compact?: boolean
}

/** Компактный индикатор ИИ-движка для сайдбара: точка состояния + режим и задержка. */
export function AiStatusIndicator({ compact = false }: AiStatusIndicatorProps) {
  const { health, latencyMs, loading, error } = useAiStatus()

  const state = error ? 'error' : health ? health.mode : loading ? 'loading' : 'unknown'
  const dot =
    state === 'error'
      ? 'bg-negative'
      : state === 'live'
        ? 'bg-positive'
        : state === 'offline'
          ? 'bg-caution'
          : 'bg-fg-3'
  const label =
    state === 'error'
      ? 'ИИ недоступен'
      : state === 'live'
        ? `ИИ в сети${latencyMs != null ? ` · ${latencyMs} мс` : ''}`
        : state === 'offline'
          ? `ИИ: офлайн${latencyMs != null ? ` · ${latencyMs} мс` : ''}`
          : 'Проверяем ИИ…'

  const title =
    error ??
    (health
      ? `${health.provider} · ${health.model}${health.message ? ` — ${health.message}` : ''}`
      : 'Состояние ИИ-движка')

  return (
    <Link
      to="/profile"
      title={title}
      className={cn(
        'flex h-10 items-center gap-2 rounded-md text-12 text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg',
        compact ? 'w-10 justify-center' : 'px-2',
      )}
    >
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dot, loading && 'animate-pulse')} aria-hidden="true" />
      {compact ? (
        <span className="sr-only">{label}</span>
      ) : (
        <span className="truncate">{label}</span>
      )}
    </Link>
  )
}

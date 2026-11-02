/** Состояние ИИ-движка: один запрос к /api/ai/health на всё приложение + измеренная задержка. */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { api } from '@/lib/api'
import type { AIHealthOut } from '@/lib/types'

interface AiStatusContextValue {
  health: AIHealthOut | null
  /** Время ответа /api/ai/health в миллисекундах (измеряется на клиенте). */
  latencyMs: number | null
  loading: boolean
  error: string | null
  checkedAt: number | null
  refresh: () => Promise<void>
}

const CACHE_MS = 60_000
const AiStatusContext = createContext<AiStatusContextValue | null>(null)

export function AiStatusProvider({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<AIHealthOut | null>(null)
  const [latencyMs, setLatencyMs] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [checkedAt, setCheckedAt] = useState<number | null>(null)
  const lastFetchRef = useRef(0)
  const inFlightRef = useRef(false)

  const load = useCallback(async (force = false) => {
    if (inFlightRef.current) return
    if (!force && Date.now() - lastFetchRef.current < CACHE_MS) return
    inFlightRef.current = true
    setLoading(true)
    setError(null)
    const startedAt = performance.now()
    try {
      const result = await api.aiHealth()
      setLatencyMs(Math.round(performance.now() - startedAt))
      setHealth(result)
      setCheckedAt(Date.now())
      lastFetchRef.current = Date.now()
    } catch (caught) {
      setHealth(null)
      setLatencyMs(null)
      setCheckedAt(Date.now())
      setError(
        caught instanceof Error && caught.message ? caught.message : 'Не удалось получить состояние ИИ-движка.',
      )
      lastFetchRef.current = Date.now()
    } finally {
      setLoading(false)
      inFlightRef.current = false
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const refresh = useCallback(() => load(true), [load])

  const value = useMemo<AiStatusContextValue>(
    () => ({ health, latencyMs, loading, error, checkedAt, refresh }),
    [health, latencyMs, loading, error, checkedAt, refresh],
  )

  return <AiStatusContext.Provider value={value}>{children}</AiStatusContext.Provider>
}

/** Доступ к состоянию ИИ. Использовать внутри AiStatusProvider. */
export function useAiStatus(): AiStatusContextValue {
  const context = useContext(AiStatusContext)
  if (!context) throw new Error('useAiStatus должен использоваться внутри AiStatusProvider')
  return context
}

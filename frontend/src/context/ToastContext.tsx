/** Глобальные тосты: единая точка показа ошибок и успехов. */
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { cn } from '@/lib/cn'

type ToastKind = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

interface ToastContextValue {
  push: (kind: ToastKind, message: string) => void
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const KIND_ICON_CLASSES: Record<ToastKind, string> = {
  success: 'text-positive',
  error: 'text-negative',
  info: 'text-accent',
}

const KIND_ICONS: Record<ToastKind, typeof Info> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
}

const LIFETIME_MS: Record<ToastKind, number> = {
  success: 4000,
  error: 6000,
  info: 4500,
}

let toastCounter = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timers = useRef<number[]>([])

  const dismiss = useCallback((id: number) => {
    setToasts((items) => items.filter((item) => item.id !== id))
  }, [])

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      toastCounter += 1
      const id = toastCounter
      setToasts((items) => [...items.slice(-3), { id, kind, message }])
      const timer = window.setTimeout(() => dismiss(id), LIFETIME_MS[kind])
      timers.current.push(timer)
    },
    [dismiss],
  )

  useEffect(() => {
    const activeTimers = timers.current
    return () => {
      activeTimers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [])

  const value = useMemo<ToastContextValue>(
    () => ({
      push,
      success: (message: string) => push('success', message),
      error: (message: string) => push('error', message),
      info: (message: string) => push('info', message),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4 sm:items-end sm:px-4"
      >
        {toasts.map((toast) => {
          const Icon = KIND_ICONS[toast.kind]
          return (
            <div
              key={toast.id}
              role="status"
              className="pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-lg border border-line bg-surface px-3 py-2.5 text-13 shadow-pop"
            >
              <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', KIND_ICON_CLASSES[toast.kind])} aria-hidden="true" />
              <p className="flex-1 leading-snug text-fg">{toast.message}</p>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Закрыть уведомление"
                className="shrink-0 rounded p-0.5 text-fg-3 transition-colors hover:bg-surface-2 hover:text-fg"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

/** Доступ к тостам. Использовать только внутри ToastProvider. */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast должен использоваться внутри ToastProvider')
  return context
}

/** Тема оформления: светлая (по умолчанию), тёмная или системная. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'

interface ThemeContextValue {
  mode: ThemeMode
  /** Фактически применённая тема с учётом системных настроек. */
  resolved: 'light' | 'dark'
  setMode: (mode: ThemeMode) => void
  toggle: () => void
}

const STORAGE_KEY = 'iq-theme'
const ThemeContext = createContext<ThemeContextValue | null>(null)

function readStoredMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  } catch {
    // Приватный режим — используем значение по умолчанию.
  }
  return 'light'
}

function prefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') return prefersDark() ? 'dark' : 'light'
  return mode
}

function applyTheme(resolved: 'light' | 'dark'): void {
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  root.style.colorScheme = resolved
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readStoredMode)
  const [resolved, setResolved] = useState<'light' | 'dark'>(() => resolveTheme(readStoredMode()))

  useEffect(() => {
    const next = resolveTheme(mode)
    setResolved(next)
    applyTheme(next)
    try {
      localStorage.setItem(STORAGE_KEY, mode)
    } catch {
      // Приватный режим — просто не сохраняем выбор.
    }
  }, [mode])

  // Следим за системной темой, пока выбран режим «как в системе».
  useEffect(() => {
    if (mode !== 'system') return
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => {
      const next = prefersDark() ? 'dark' : 'light'
      setResolved(next)
      applyTheme(next)
    }
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [mode])

  const setMode = useCallback((next: ThemeMode) => setModeState(next), [])

  const toggle = useCallback(() => {
    setModeState((current) => {
      const currentlyDark = resolveTheme(current) === 'dark'
      return currentlyDark ? 'light' : 'dark'
    })
  }, [])

  const value = useMemo<ThemeContextValue>(() => ({ mode, resolved, setMode, toggle }), [mode, resolved, setMode, toggle])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

/** Доступ к теме. Использовать внутри ThemeProvider. */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme должен использоваться внутри ThemeProvider')
  return context
}

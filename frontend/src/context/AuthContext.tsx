/** Контекст авторизации: JWT в localStorage, текущий пользователь, вход/выход. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { api, getToken, setToken, setUnauthorizedHandler } from '@/lib/api'
import type { UserOut } from '@/lib/types'

interface AuthContextValue {
  user: UserOut | null
  /** true, пока проверяем сохранённый токен при старте приложения. */
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, fullName: string) => Promise<void>
  logout: () => void
  /** Обновить данные пользователя (например, после сохранения профиля). */
  refreshUser: () => Promise<void>
  setUser: (user: UserOut) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<UserOut | null>(null)
  const [loading, setLoading] = useState(true)

  // Проверяем сохранённый токен один раз при старте.
  useEffect(() => {
    let cancelled = false
    async function restore() {
      if (!getToken()) {
        setLoading(false)
        return
      }
      try {
        const currentUser = await api.auth.me()
        if (!cancelled) setUserState(currentUser)
      } catch {
        setToken(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void restore()
    return () => {
      cancelled = true
    }
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setUserState(null)
  }, [])

  // Любой ответ 401 — разлогиниваем (api.ts вызывает этот обработчик).
  useEffect(() => {
    setUnauthorizedHandler(() => setUserState(null))
    return () => setUnauthorizedHandler(null)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const response = await api.auth.login({ email, password })
    setToken(response.access_token)
    setUserState(response.user)
  }, [])

  const register = useCallback(async (email: string, password: string, fullName: string) => {
    const response = await api.auth.register({ email, password, full_name: fullName })
    setToken(response.access_token)
    setUserState(response.user)
  }, [])

  const refreshUser = useCallback(async () => {
    const currentUser = await api.auth.me()
    setUserState(currentUser)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login,
      register,
      logout,
      refreshUser,
      setUser: setUserState,
    }),
    [user, loading, login, register, logout, refreshUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** Доступ к состоянию авторизации. Использовать только внутри AuthProvider. */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth должен использоваться внутри AuthProvider')
  return context
}

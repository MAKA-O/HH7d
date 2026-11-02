/** Маршрутизация с проверкой авторизации и общими состояниями загрузки. */
import { Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { Layout } from '@/components/Layout'
import { AiStatusProvider } from '@/context/AiStatusContext'
import { useAuth } from '@/context/AuthContext'

/** Полноэкранный индикатор загрузки приложения. */
export function FullPageLoader({ label = 'Загрузка…' }: { label?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-fg-2">
      <Loader2 className="h-5 w-5 animate-spin text-accent" aria-hidden="true" />
      <p className="text-13">{label}</p>
    </div>
  )
}

/** Защищённые маршруты: требует авторизации, оборачивает страницы в Layout. */
export function ProtectedRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <FullPageLoader label="Проверяем сессию…" />
  if (!user) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />

  return (
    <AiStatusProvider>
      <Layout>
        <Outlet />
      </Layout>
    </AiStatusProvider>
  )
}

/** Страницы для гостей: авторизованного пользователя уводим на дашборд. */
export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <FullPageLoader label="Проверяем сессию…" />
  if (user) return <Navigate to="/" replace />
  return <>{children}</>
}

/** Основной каркас приложения: боковая навигация и мобильное меню. */
import {
  Code2,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Sparkles,
  User,
  X,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'

import { useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/cn'
import { Brand } from '@/components/Brand'

const NAV_ITEMS = [
  { to: '/', label: 'Дашборд', icon: LayoutDashboard, end: true },
  { to: '/interview/new', label: 'Собеседование', icon: Sparkles, end: false },
  { to: '/chat', label: 'Чат по теории', icon: MessageSquare, end: false },
  { to: '/code', label: 'Задачи с кодом', icon: Code2, end: false },
  { to: '/history', label: 'История сессий', icon: History, end: false },
  { to: '/profile', label: 'Профиль', icon: User, end: false },
]

function initials(fullName: string, email: string): string {
  const source = fullName.trim() || email
  const parts = source.split(/[\s@._-]+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                isActive
                  ? 'bg-accent-500/15 text-accent-100 shadow-[inset_0_0_0_1px_rgba(129,140,248,0.25)]'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-100',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  className={cn('h-[18px] w-[18px] transition', isActive ? 'text-accent-300' : 'text-slate-500 group-hover:text-slate-300')}
                  aria-hidden="true"
                />
                {item.label}
              </>
            )}
          </NavLink>
        )
      })}
    </nav>
  )
}

function UserPanel({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  if (!user) return null

  const handleLogout = () => {
    logout()
    onNavigate?.()
    navigate('/login', { replace: true })
  }

  return (
    <div className="border-t border-white/10 p-3">
      <div className="mb-2 flex items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-700 to-slate-600 text-xs font-semibold text-slate-100">
          {initials(user.full_name, user.email)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-100">{user.full_name || 'Без имени'}</p>
          <p className="truncate text-xs text-slate-500">{user.email}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={handleLogout}
        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-300"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        Выйти из аккаунта
      </button>
    </div>
  )
}

/** Каркас защищённых страниц: сайдбар на десктопе, шторка на мобильных. */
export function Layout({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  return (
    <div className="min-h-screen">
      {/* Сайдбар на десктопе */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-white/10 bg-ink-900/70 backdrop-blur-xl lg:flex">
        <div className="px-5 pb-2 pt-5">
          <Brand />
        </div>
        <Navigation />
        <UserPanel />
      </aside>

      {/* Мобильная шапка */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-white/10 bg-ink-950/80 px-4 py-3 backdrop-blur-xl lg:hidden">
        <Brand />
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Открыть меню"
          className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/10"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
      </header>

      {/* Мобильная шторка */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Закрыть меню"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm"
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-white/10 bg-ink-900 shadow-2xl animate-fade-up">
            <div className="flex items-center justify-between px-5 pb-2 pt-5">
              <Brand />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Закрыть меню"
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/5 hover:text-slate-200"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <Navigation onNavigate={() => setMobileOpen(false)} />
            <UserPanel onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}

      <main className="lg:pl-64">
        <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pt-8">{children}</div>
      </main>
    </div>
  )
}

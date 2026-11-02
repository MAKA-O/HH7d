/** Каркас приложения: сайдбар 240px (планшет — 64px), топбар 56px, мобильный drawer. */
import {
  Code2,
  History,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Sparkles,
  User,
  X,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

import { AiStatusIndicator } from '@/components/AiStatusIndicator'
import { Brand } from '@/components/Brand'
import { GlobalSearch } from '@/components/GlobalSearch'
import { NotificationsMenu } from '@/components/NotificationsMenu'
import { ThemeToggle } from '@/components/ThemeToggle'
import { UserMenu } from '@/components/UserMenu'
import { Breadcrumbs, type Crumb } from '@/components/ui/Breadcrumbs'
import { IconButton } from '@/components/ui/Button'
import { cn } from '@/lib/cn'

const NAV_ITEMS = [
  { to: '/', label: 'Дашборд', icon: LayoutDashboard, end: true },
  { to: '/interview/new', label: 'Новое собеседование', icon: Sparkles, end: false },
  { to: '/history', label: 'История сессий', icon: History, end: false },
  { to: '/chat', label: 'Чат по теории', icon: MessageSquare, end: false },
  { to: '/code', label: 'Задачи с кодом', icon: Code2, end: false },
  { to: '/profile', label: 'Профиль', icon: User, end: false },
]

/** Хлебные крошки по текущему маршруту. */
function crumbsFor(pathname: string): Crumb[] {
  if (pathname === '/') return [{ label: 'Дашборд' }]
  if (pathname === '/history') return [{ label: 'Дашборд', to: '/' }, { label: 'История сессий' }]
  if (pathname === '/interview/new')
    return [{ label: 'Дашборд', to: '/' }, { label: 'Собеседования', to: '/history' }, { label: 'Новая сессия' }]
  if (pathname === '/chat') return [{ label: 'Дашборд', to: '/' }, { label: 'Чат по теории' }]
  if (pathname === '/code') return [{ label: 'Дашборд', to: '/' }, { label: 'Задачи с кодом' }]
  if (pathname === '/profile') return [{ label: 'Дашборд', to: '/' }, { label: 'Профиль' }]

  const reportMatch = pathname.match(/^\/interview\/(\d+)\/report$/)
  if (reportMatch) {
    const id = reportMatch[1]
    return [
      { label: 'Дашборд', to: '/' },
      { label: 'История', to: '/history' },
      { label: `Сессия #${id}`, to: `/interview/${id}` },
      { label: 'Отчёт' },
    ]
  }
  const interviewMatch = pathname.match(/^\/interview\/(\d+)$/)
  if (interviewMatch) {
    return [
      { label: 'Дашборд', to: '/' },
      { label: 'История', to: '/history' },
      { label: `Сессия #${interviewMatch[1]}` },
    ]
  }
  return [{ label: 'Дашборд', to: '/' }]
}

interface NavListProps {
  variant: 'sidebar' | 'drawer'
  onNavigate?: () => void
}

function NavList({ variant, onNavigate }: NavListProps) {
  return (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-3" aria-label="Основная навигация">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon
        const isSidebar = variant === 'sidebar'
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            title={isSidebar ? item.label : undefined}
            className={({ isActive }) =>
              cn(
                'flex h-10 items-center gap-2.5 rounded-md text-13 font-medium transition-colors',
                isSidebar ? 'justify-center px-0 xl:justify-start xl:px-2.5' : 'px-2.5',
                isActive ? 'bg-accent-soft text-accent' : 'text-fg-2 hover:bg-surface-2 hover:text-fg',
              )
            }
          >
            <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
            {isSidebar ? (
              <>
                <span className="hidden truncate xl:inline">{item.label}</span>
                <span className="sr-only xl:hidden">{item.label}</span>
              </>
            ) : (
              <span className="truncate">{item.label}</span>
            )}
          </NavLink>
        )
      })}
    </nav>
  )
}

function SidebarFooter({ variant }: { variant: 'sidebar' | 'drawer' }) {
  const isSidebar = variant === 'sidebar'
  return (
    <div className="shrink-0 border-t border-line p-2">
      <div className={cn('flex items-center', isSidebar ? 'justify-center xl:justify-start' : 'justify-start')}>
        <span className={cn(isSidebar && 'xl:hidden')}>
          <AiStatusIndicator compact={isSidebar} />
        </span>
        {isSidebar ? (
          <span className="hidden xl:block">
            <AiStatusIndicator />
          </span>
        ) : null}
      </div>
      <div className={cn('mt-1 flex items-center gap-1', isSidebar ? 'justify-center xl:justify-start' : 'justify-start')}>
        <ThemeToggle />
        {isSidebar ? (
          <span className="hidden text-12 text-fg-3 xl:inline">Тема оформления</span>
        ) : (
          <span className="text-12 text-fg-3">Тема оформления</span>
        )}
      </div>
    </div>
  )
}

/** Каркас защищённых страниц. */
export function Layout({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const location = useLocation()
  const crumbs = crumbsFor(location.pathname)

  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname])

  return (
    <div className="min-h-screen bg-canvas">
      {/* Сайдбар: 64px на планшете, 240px на десктопе */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-16 flex-col border-r border-line bg-surface md:flex xl:w-60">
        <div className="flex h-14 shrink-0 items-center justify-center border-b border-line px-4 xl:justify-start">
          <span className="xl:hidden">
            <Brand iconOnly />
          </span>
          <span className="hidden xl:block">
            <Brand />
          </span>
        </div>
        <NavList variant="sidebar" />
        <SidebarFooter variant="sidebar" />
      </aside>

      {/* Мобильная шторка */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Закрыть меню"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 max-w-[85vw] flex-col border-r border-line bg-surface shadow-pop">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
              <Brand />
              <IconButton label="Закрыть меню" onClick={() => setDrawerOpen(false)}>
                <X className="h-5 w-5" aria-hidden="true" />
              </IconButton>
            </div>
            <NavList variant="drawer" onNavigate={() => setDrawerOpen(false)} />
            <SidebarFooter variant="drawer" />
          </aside>
        </div>
      ) : null}

      <div className="flex min-h-screen flex-col md:pl-16 xl:pl-60">
        {/* Топбар 56px */}
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-4 sm:gap-4 sm:px-6">
          <div className="md:hidden">
            <IconButton label="Открыть меню" onClick={() => setDrawerOpen(true)}>
              <Menu className="h-5 w-5" aria-hidden="true" />
            </IconButton>
          </div>

          <Breadcrumbs items={crumbs} className="flex-1" />

          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
            <GlobalSearch />
            <NotificationsMenu />
            <UserMenu />
          </div>
        </header>

        <main className="flex-1">
          <div className="mx-auto w-full max-w-container px-4 py-6 sm:px-6">{children}</div>
        </main>
      </div>
    </div>
  )
}

import { LogOut, UserRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/Button'
import { Popover } from '@/components/ui/Popover'
import { Segmented } from '@/components/ui/Segmented'
import { useAuth } from '@/context/AuthContext'
import { useTheme, type ThemeMode } from '@/context/ThemeContext'

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
  { value: 'light', label: 'Светлая' },
  { value: 'dark', label: 'Тёмная' },
  { value: 'system', label: 'Система' },
]

function initials(fullName: string, email: string): string {
  const source = fullName.trim() || email
  const parts = source.split(/[\s@._-]+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

/** Меню пользователя: профиль, тема оформления, выход. */
export function UserMenu() {
  const { user, logout } = useAuth()
  const { mode, setMode } = useTheme()
  const navigate = useNavigate()

  if (!user) return null

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <Popover
      panelClassName="w-64"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Меню пользователя"
          className="inline-flex h-10 items-center gap-2 rounded-md px-1.5 transition-colors hover:bg-surface-2"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-line bg-surface-2 text-12 font-medium text-fg-2">
            {initials(user.full_name, user.email)}
          </span>
          <span className="hidden max-w-[160px] truncate text-13 font-medium text-fg xl:block">
            {user.full_name || user.email}
          </span>
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="border-b border-line px-3 py-3">
            <p className="truncate text-13 font-medium text-fg">{user.full_name || 'Без имени'}</p>
            <p className="truncate text-12 text-fg-3">{user.email}</p>
          </div>

          <div className="border-b border-line p-1">
            <button
              type="button"
              onClick={() => {
                close()
                navigate('/profile')
              }}
              className="flex h-10 w-full items-center gap-2.5 rounded-md px-2.5 text-13 text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <UserRound className="h-4 w-4" aria-hidden="true" />
              Профиль
            </button>
          </div>

          <div className="space-y-2 border-b border-line px-3 py-3">
            <p className="text-12 font-medium text-fg-3">Тема</p>
            <Segmented
              fullWidth
              options={THEME_OPTIONS}
              value={mode}
              onChange={(value) => setMode(value)}
              ariaLabel="Тема оформления"
            />
          </div>

          <div className="p-1">
            <Button
              variant="ghost"
              fullWidth
              className="justify-start text-negative hover:bg-negative-soft hover:text-negative"
              leftIcon={<LogOut className="h-4 w-4" aria-hidden="true" />}
              onClick={() => {
                close()
                handleLogout()
              }}
            >
              Выйти
            </Button>
          </div>
        </div>
      )}
    </Popover>
  )
}

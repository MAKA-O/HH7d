import { Moon, Sun } from 'lucide-react'

import { IconButton } from '@/components/ui/Button'
import { useTheme } from '@/context/ThemeContext'

/** Переключатель светлой/тёмной темы (иконка показывает целевое состояние). */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolved, toggle } = useTheme()
  const isDark = resolved === 'dark'
  return (
    <IconButton
      label={isDark ? 'Включить светлую тему' : 'Включить тёмную тему'}
      onClick={toggle}
      className={className}
    >
      {isDark ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
    </IconButton>
  )
}

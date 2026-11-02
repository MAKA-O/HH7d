import { AlertTriangle, Bell, CheckCircle2, Cpu } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { IconButton } from '@/components/ui/Button'
import { Popover } from '@/components/ui/Popover'
import { useAiStatus } from '@/context/AiStatusContext'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { formatRelativeDate, formatScore } from '@/lib/format'
import { LEVEL_LABELS, ROLE_SHORT_LABELS, labelOf } from '@/lib/labels'
import type { SessionSummary } from '@/lib/types'

const READ_KEY = 'iq-notifications-read'

function readReadIds(): string[] {
  try {
    const raw = localStorage.getItem(READ_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
  } catch {
    return []
  }
}

function saveReadIds(ids: string[]): void {
  try {
    localStorage.setItem(READ_KEY, JSON.stringify(ids.slice(-100)))
  } catch {
    // Приватный режим — состояние прочтения просто не сохранится.
  }
}

type NotificationTone = 'neutral' | 'positive' | 'caution' | 'negative'

interface NotificationItem {
  id: string
  tone: NotificationTone
  icon: typeof Cpu
  title: string
  description: string
  time?: string
  href?: string
}

const TONE_CLASSES: Record<NotificationTone, string> = {
  neutral: 'text-fg-3',
  positive: 'text-positive',
  caution: 'text-caution',
  negative: 'text-negative',
}

/** Колокольчик: статус ИИ, завершённые сессии, прочитанность в localStorage. */
export function NotificationsMenu() {
  const navigate = useNavigate()
  const { health, latencyMs, loading: aiLoading, error: aiError } = useAiStatus()

  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [readIds, setReadIds] = useState<string[]>(readReadIds)

  useEffect(() => {
    let cancelled = false
    api.interviews
      .list(10, 0)
      .then((data) => {
        if (!cancelled) setSessions(data.items)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const items = useMemo<NotificationItem[]>(() => {
    const list: NotificationItem[] = []

    if (aiError) {
      list.push({
        id: 'ai-status-error',
        tone: 'negative',
        icon: AlertTriangle,
        title: 'ИИ-движок недоступен',
        description: aiError,
        time: 'только что',
      })
    } else if (health) {
      list.push({
        id: `ai-status-${health.mode}`,
        tone: health.mode === 'live' ? 'positive' : 'caution',
        icon: Cpu,
        title: health.mode === 'live' ? 'ИИ-движок работает в live-режиме' : 'ИИ работает в офлайн-режиме',
        description: `${health.provider} · ${health.model}${latencyMs != null ? ` · ответ ${latencyMs} мс` : ''}${
          health.message ? ` · ${health.message}` : ''
        }`,
        time: health.mode === 'live' ? 'внешняя модель' : 'вопросы из банка, оценки по эвристикам',
      })
    } else if (aiLoading) {
      list.push({
        id: 'ai-status-loading',
        tone: 'neutral',
        icon: Cpu,
        title: 'Проверяем ИИ-движок',
        description: 'Запрашиваем состояние /api/ai/health…',
      })
    }

    sessions
      .filter((session) => session.status === 'completed')
      .slice(0, 3)
      .forEach((session) => {
        list.push({
          id: `session-${session.id}`,
          tone: 'positive',
          icon: CheckCircle2,
          title: `Сессия #${session.id} завершена`,
          description: `${labelOf(ROLE_SHORT_LABELS, session.role)} · ${labelOf(LEVEL_LABELS, session.level)} · балл ${formatScore(session.overall_score)}`,
          time: formatRelativeDate(session.started_at),
          href: `/interview/${session.id}/report`,
        })
      })

    return list
  }, [aiError, aiLoading, health, latencyMs, sessions])

  const unreadCount = items.filter((item) => !readIds.includes(item.id)).length

  const markRead = (ids: string[]) => {
    const next = Array.from(new Set([...readIds, ...ids]))
    setReadIds(next)
    saveReadIds(next)
  }

  return (
    <Popover
      panelClassName="w-[340px]"
      trigger={({ open, toggle }) => (
        <div className="relative">
          <IconButton
            label={unreadCount > 0 ? `Уведомления: ${unreadCount} новых` : 'Уведомления'}
            onClick={toggle}
            aria-expanded={open}
          >
            <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
          </IconButton>
          {unreadCount > 0 ? (
            <span
              className="pointer-events-none absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-accent"
              aria-hidden="true"
            />
          ) : null}
        </div>
      )}
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <p className="text-13 font-semibold text-fg">Уведомления</p>
            <button
              type="button"
              onClick={() => markRead(items.map((item) => item.id))}
              disabled={unreadCount === 0}
              className="text-12 font-medium text-accent transition-colors hover:text-accent-hover disabled:text-fg-3"
            >
              Прочитать все
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-3 py-6 text-center text-13 text-fg-2">Нет уведомлений</p>
            ) : (
              items.map((item) => {
                const Icon = item.icon
                const unread = !readIds.includes(item.id)
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      markRead([item.id])
                      close()
                      if (item.href) navigate(item.href)
                    }}
                    className="flex w-full items-start gap-2.5 border-b border-line px-3 py-3 text-left transition-colors last:border-b-0 hover:bg-surface-2"
                  >
                    <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', TONE_CLASSES[item.tone])} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-13 font-medium text-fg">{item.title}</span>
                        {unread ? (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-label="непрочитано" />
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-12 leading-relaxed text-fg-2">{item.description}</span>
                      {item.time ? <span className="mt-0.5 block text-12 text-fg-3">{item.time}</span> : null}
                    </span>
                  </button>
                )
              })
            )}
          </div>

          <div className="border-t border-line px-3 py-2">
            <Link
              to="/profile"
              onClick={close}
              className="text-12 font-medium text-accent transition-colors hover:text-accent-hover"
            >
              Состояние ИИ и настройки
            </Link>
          </div>
        </div>
      )}
    </Popover>
  )
}

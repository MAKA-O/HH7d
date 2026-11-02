import { ChevronRight, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'

import { SessionCard } from '@/components/SessionCard'
import { Badge } from '@/components/ui/Badge'
import { IconButton } from '@/components/ui/Button'
import { formatDate, formatScore } from '@/lib/format'
import { LEVEL_LABELS, MODE_SHORT_LABELS, ROLE_SHORT_LABELS, STATUS_LABELS, labelOf } from '@/lib/labels'
import type { SessionSummary } from '@/lib/types'

interface SessionTableProps {
  sessions: SessionSummary[]
  onDelete?: (session: SessionSummary) => void
  showMode?: boolean
}

/**
 * Таблица сессий: на десктопе — плотные строки 44px, на мобильном — карточки.
 * Данные и ссылки полностью соответствуют контракту API.
 */
export function SessionTable({ sessions, onDelete, showMode = true }: SessionTableProps) {
  const targetFor = (session: SessionSummary) =>
    session.status === 'completed' ? `/interview/${session.id}/report` : `/interview/${session.id}`

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[680px] border-collapse">
          <thead>
            <tr className="table-head">
              <th scope="col" className="px-4 text-left font-medium">Сессия</th>
              <th scope="col" className="px-4 text-left font-medium">Направление</th>
              <th scope="col" className="px-4 text-left font-medium">Уровень</th>
              {showMode ? <th scope="col" className="px-4 text-left font-medium">Режим</th> : null}
              <th scope="col" className="px-4 text-left font-medium">Статус</th>
              <th scope="col" className="px-4 text-right font-medium">Балл</th>
              <th scope="col" className="px-4 text-right font-medium">Ответов</th>
              <th scope="col" className="px-4 text-left font-medium">Дата</th>
              <th scope="col" className="w-24 px-2 text-right">
                <span className="sr-only">Действия</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => (
              <tr key={session.id} className="table-row transition-colors hover:bg-surface-2">
                <td className="px-4">
                  <Link
                    to={targetFor(session)}
                    className="text-14 font-medium text-fg transition-colors hover:text-accent"
                  >
                    #{session.id}
                  </Link>
                </td>
                <td className="px-4 text-14 text-fg-2">{labelOf(ROLE_SHORT_LABELS, session.role)}</td>
                <td className="px-4 text-13 text-fg-2">{labelOf(LEVEL_LABELS, session.level)}</td>
                {showMode ? (
                  <td className="px-4 text-13 text-fg-2">{labelOf(MODE_SHORT_LABELS, session.mode)}</td>
                ) : null}
                <td className="px-4">
                  <Badge tone={session.status === 'completed' ? 'positive' : 'accent'}>
                    {labelOf(STATUS_LABELS, session.status)}
                  </Badge>
                </td>
                <td className="px-4 text-right text-14 font-medium tabular-nums text-fg">
                  {formatScore(session.overall_score)}
                </td>
                <td className="px-4 text-right text-13 tabular-nums text-fg-2">
                  {session.answered_count}/{session.question_count}
                </td>
                <td className="whitespace-nowrap px-4 text-13 text-fg-2">{formatDate(session.started_at)}</td>
                <td className="px-2">
                  <div className="flex items-center justify-end gap-0.5">
                    <Link
                      to={targetFor(session)}
                      aria-label={`Открыть сессию #${session.id}`}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-md text-fg-3 transition-colors hover:bg-surface-2 hover:text-fg"
                    >
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                    {onDelete ? (
                      <IconButton
                        label={`Удалить сессию #${session.id}`}
                        variant="danger"
                        onClick={() => onDelete(session)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </IconButton>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="md:hidden">
        {sessions.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            onDelete={onDelete ? () => onDelete(session) : undefined}
          />
        ))}
      </div>
    </>
  )
}

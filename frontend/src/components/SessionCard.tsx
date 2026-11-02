import { ChevronRight, Clock, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/cn'
import { formatDuration, formatRelativeDate, formatScore, questionsLabel } from '@/lib/format'
import {
  LEVEL_LABELS,
  MODE_SHORT_LABELS,
  ROLE_SHORT_LABELS,
  STATUS_LABELS,
  labelOf,
  statusClasses,
} from '@/lib/labels'
import type { SessionSummary } from '@/lib/types'

interface SessionCardProps {
  session: SessionSummary
  onDelete?: () => void
  className?: string
}

/** Карточка сессии собеседования: статус, балл, прогресс ответов. */
export function SessionCard({ session, onDelete, className }: SessionCardProps) {
  const target =
    session.status === 'completed' ? `/interview/${session.id}/report` : `/interview/${session.id}`
  const answered = Math.min(session.answered_count, session.question_count)
  const progress = session.question_count > 0 ? Math.round((answered / session.question_count) * 100) : 0

  return (
    <div className={cn('surface surface-hover group', className)}>
      <div className="flex items-start gap-3 p-4 sm:p-5">
        <Link to={target} className="min-w-0 flex-1 rounded-lg">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">{labelOf(ROLE_SHORT_LABELS, session.role)}</Badge>
            <Badge>{labelOf(LEVEL_LABELS, session.level)}</Badge>
            <Badge tone="violet">{labelOf(MODE_SHORT_LABELS, session.mode)}</Badge>
            <Badge className={statusClasses(session.status)}>{labelOf(STATUS_LABELS, session.status)}</Badge>
          </div>

          <div className="mt-3 flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm text-slate-300">
                {questionsLabel(session.question_count)} · отвечено {answered}
              </p>
              <p className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                <span>{formatRelativeDate(session.started_at)}</span>
                {session.duration_sec > 0 ? (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    {formatDuration(session.duration_sec)}
                  </span>
                ) : null}
              </p>
            </div>
            <div className="text-right">
              <p
                className={cn(
                  'text-2xl font-semibold tabular-nums',
                  session.status === 'completed' ? 'text-slate-50' : 'text-slate-500',
                )}
              >
                {formatScore(session.overall_score)}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">балл</p>
            </div>
          </div>

          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className={cn('h-full rounded-full', session.status === 'completed' ? 'bg-emerald-400/70' : 'bg-sky-400/70')}
              style={{ width: `${progress}%` }}
            />
          </div>
        </Link>

        <div className="flex shrink-0 flex-col items-center gap-1">
          {onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              aria-label="Удалить сессию"
              title="Удалить сессию"
              className="rounded-lg p-2 text-slate-500 transition hover:bg-rose-500/10 hover:text-rose-300"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
          <Link
            to={target}
            aria-label="Открыть сессию"
            className="rounded-lg p-2 text-slate-600 transition group-hover:text-slate-300"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  )
}

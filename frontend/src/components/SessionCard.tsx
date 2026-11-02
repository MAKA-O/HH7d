import { ChevronRight, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/Badge'
import { IconButton } from '@/components/ui/Button'
import { formatDate, formatScore } from '@/lib/format'
import { LEVEL_LABELS, MODE_SHORT_LABELS, ROLE_SHORT_LABELS, STATUS_LABELS, labelOf } from '@/lib/labels'
import type { SessionSummary } from '@/lib/types'

interface SessionCardProps {
  session: SessionSummary
  onDelete?: () => void
}

/** Карточка сессии для мобильной ширины (таблицы заменяются карточками). */
export function SessionCard({ session, onDelete }: SessionCardProps) {
  const target = session.status === 'completed' ? `/interview/${session.id}/report` : `/interview/${session.id}`

  return (
    <div className="flex items-start gap-1 border-b border-line px-4 py-3 last:border-b-0">
      <Link to={target} className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-14 font-medium text-fg">Сессия #{session.id}</p>
          <span className="text-16 font-semibold tabular-nums text-fg">{formatScore(session.overall_score)}</span>
        </div>
        <p className="mt-0.5 truncate text-13 text-fg-2">
          {labelOf(ROLE_SHORT_LABELS, session.role)} · {labelOf(LEVEL_LABELS, session.level)} ·{' '}
          {labelOf(MODE_SHORT_LABELS, session.mode)}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge tone={session.status === 'completed' ? 'positive' : 'accent'}>
            {labelOf(STATUS_LABELS, session.status)}
          </Badge>
          <span className="text-12 text-fg-3">
            {formatDate(session.started_at)} · отвечено {session.answered_count} из {session.question_count}
          </span>
        </div>
      </Link>
      <div className="flex shrink-0 flex-col items-center">
        {onDelete ? (
          <IconButton label={`Удалить сессию #${session.id}`} variant="danger" onClick={onDelete}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </IconButton>
        ) : null}
        <Link
          to={target}
          aria-label={`Открыть сессию #${session.id}`}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-fg-3 transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  )
}

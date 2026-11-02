import { AlertCircle, History, Plus, RefreshCw, Sparkles, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { PageHeader } from '@/components/PageHeader'
import { SessionCard } from '@/components/SessionCard'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/context/ToastContext'
import { ApiError, api } from '@/lib/api'
import { plural, formatDate } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { SessionSummary } from '@/lib/types'

const PAGE_SIZE = 20

type Filter = 'all' | 'completed' | 'in_progress'

const FILTERS: Array<{ code: Filter; label: string }> = [
  { code: 'all', label: 'Все' },
  { code: 'completed', label: 'Завершённые' },
  { code: 'in_progress', label: 'В процессе' },
]

export function HistoryPage() {
  const navigate = useNavigate()
  const toast = useToast()

  const [items, setItems] = useState<SessionSummary[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [deleteTarget, setDeleteTarget] = useState<SessionSummary | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async (offset = 0) => {
    if (offset === 0) {
      setLoading(true)
      setError(null)
    } else {
      setLoadingMore(true)
    }
    try {
      const data = await api.interviews.list(PAGE_SIZE, offset)
      setItems((previous) => (offset === 0 ? data.items : [...previous, ...data.items]))
      setTotal(data.total)
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message ? caught.message : 'Не удалось загрузить историю собеседований.',
      )
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    void load(0)
  }, [load])

  const filtered = useMemo(
    () => (filter === 'all' ? items : items.filter((session) => session.status === filter)),
    [items, filter],
  )

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    try {
      await api.interviews.remove(deleteTarget.id)
      setItems((previous) => previous.filter((session) => session.id !== deleteTarget.id))
      setTotal((previous) => Math.max(0, previous - 1))
      setDeleteTarget(null)
      toast.success('Сессия удалена')
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.detail : 'Не удалось удалить сессию.')
    } finally {
      setDeleting(false)
    }
  }

  const hasMore = items.length < total

  return (
    <div>
      <PageHeader
        eyebrow="История"
        title="Собеседования"
        description="Все ваши сессии: баллы, статусы и отчёты. Откройте любую, чтобы посмотреть ответы и рекомендации."
        actions={
          <Button onClick={() => navigate('/interview/new')} leftIcon={<Plus className="h-4 w-4" />}>
            Новое собеседование
          </Button>
        }
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((item) => (
            <button
              key={item.code}
              type="button"
              onClick={() => setFilter(item.code)}
              aria-pressed={filter === item.code}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-xs font-medium transition',
                filter === item.code
                  ? 'border-accent-400/40 bg-accent-500/10 text-accent-100'
                  : 'border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/20 hover:text-slate-200',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          Всего {total} {plural(total, ['сессия', 'сессии', 'сессий'])}
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
        </div>
      ) : error ? (
        <Card className="border-rose-500/25 bg-rose-500/[0.04]">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-rose-100">Не удалось загрузить историю</p>
                <p className="mt-0.5 text-xs text-rose-200/70">{error}</p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => void load(0)} leftIcon={<RefreshCw className="h-4 w-4" />}>
              Повторить
            </Button>
          </div>
        </Card>
      ) : filtered.length === 0 ? (
        items.length === 0 ? (
          <Card>
            <EmptyState
              icon={Sparkles}
              title="История пока пуста"
              description="Пройдите первое собеседование — здесь появятся сессии, баллы и отчёты."
              action={
                <Button onClick={() => navigate('/interview/new')} leftIcon={<Plus className="h-4 w-4" />}>
                  Начать собеседование
                </Button>
              }
            />
          </Card>
        ) : (
          <Card>
            <EmptyState
              icon={History}
              title="Нет сессий с таким статусом"
              description="Попробуйте другой фильтр — например, «Завершённые»."
              action={
                <Button variant="secondary" size="sm" onClick={() => setFilter('all')}>
                  Показать все
                </Button>
              }
            />
          </Card>
        )
      ) : (
        <div className="space-y-3">
          {filtered.map((session) => (
            <SessionCard key={session.id} session={session} onDelete={() => setDeleteTarget(session)} />
          ))}

          {hasMore && filter === 'all' ? (
            <div className="flex justify-center pt-2">
              <Button variant="secondary" onClick={() => void load(items.length)} loading={loadingMore}>
                Загрузить ещё
              </Button>
            </div>
          ) : null}
        </div>
      )}

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Удалить сессию?"
        description={
          deleteTarget
            ? `Сессия от ${formatDate(deleteTarget.started_at)} будет удалена вместе с ответами и оценками.`
            : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Отмена
            </Button>
            <Button variant="danger" onClick={() => void handleDelete()} loading={deleting} leftIcon={<Trash2 className="h-4 w-4" />}>
              Удалить
            </Button>
          </>
        }
      />
    </div>
  )
}

import { AlertCircle, History, Plus, RefreshCw, RotateCcw, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { PageHeader } from '@/components/PageHeader'
import { SessionTable } from '@/components/SessionTable'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Checkbox } from '@/components/ui/Checkbox'
import { EmptyState } from '@/components/ui/EmptyState'
import { Select } from '@/components/ui/Field'
import { Input } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { RangeSlider } from '@/components/ui/RangeSlider'
import { Segmented } from '@/components/ui/Segmented'
import { Skeleton, SkeletonTableRows } from '@/components/ui/Skeleton'
import { useToast } from '@/context/ToastContext'
import { ApiError, api } from '@/lib/api'
import { formatScore, plural } from '@/lib/format'
import {
  LEVEL_LABELS,
  MODE_SHORT_LABELS,
  ROLE_LABELS,
  ROLE_SHORT_LABELS,
  STATUS_LABELS,
  labelOf,
} from '@/lib/labels'
import type { MetaOut, SessionSummary } from '@/lib/types'

const PAGE_SIZE = 20

type StatusFilter = 'all' | 'completed' | 'in_progress'

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'Все' },
  { value: 'completed', label: 'Завершённые' },
  { value: 'in_progress', label: 'В процессе' },
]

export function HistoryPage() {
  const navigate = useNavigate()
  const toast = useToast()

  const [items, setItems] = useState<SessionSummary[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [meta, setMeta] = useState<MetaOut | null>(null)

  const [search, setSearch] = useState('')
  const [roles, setRoles] = useState<string[]>([])
  const [level, setLevel] = useState('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [minScore, setMinScore] = useState(0)

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

  useEffect(() => {
    let cancelled = false
    api
      .meta()
      .then((data) => {
        if (!cancelled) setMeta(data)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const roleOptions = useMemo(() => {
    if (meta?.roles.length) return meta.roles.map((role) => ({ code: role.code, title: role.title }))
    return Object.keys(ROLE_LABELS).map((code) => ({ code, title: ROLE_LABELS[code] }))
  }, [meta])

  const levelOptions = useMemo(() => {
    if (meta?.levels.length) return meta.levels
    return Object.keys(LEVEL_LABELS).map((code) => ({ code, title: LEVEL_LABELS[code] }))
  }, [meta])

  const activeFilterCount =
    roles.length + (level !== 'all' ? 1 : 0) + (status !== 'all' ? 1 : 0) + (minScore > 0 ? 1 : 0) + (search.trim() ? 1 : 0)

  const resetFilters = () => {
    setSearch('')
    setRoles([])
    setLevel('all')
    setStatus('all')
    setMinScore(0)
  }

  const filtered = useMemo(
    () =>
      items.filter((session) => {
        if (status !== 'all' && session.status !== status) return false
        if (level !== 'all' && session.level !== level) return false
        if (roles.length > 0 && !roles.includes(session.role)) return false
        if (minScore > 0 && (session.overall_score == null || session.overall_score < minScore)) return false

        const needle = search.trim().toLowerCase()
        if (needle) {
          const haystack = [
            `#${session.id}`,
            String(session.id),
            session.role,
            session.level,
            session.mode,
            labelOf(ROLE_SHORT_LABELS, session.role),
            labelOf(LEVEL_LABELS, session.level),
            labelOf(MODE_SHORT_LABELS, session.mode),
            labelOf(STATUS_LABELS, session.status),
          ]
            .join(' ')
            .toLowerCase()
          if (!haystack.includes(needle)) return false
        }
        return true
      }),
    [items, level, minScore, roles, search, status],
  )

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    try {
      await api.interviews.remove(deleteTarget.id)
      setItems((previous) => previous.filter((session) => session.id !== deleteTarget.id))
      setTotal((previous) => Math.max(0, previous - 1))
      setDeleteTarget(null)
      toast.success(`Сессия #${deleteTarget.id} удалена`)
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.detail : 'Не удалось удалить сессию.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="История сессий"
        description="Все собеседования: баллы, статусы и отчёты. Фильтруйте по направлению, уровню и баллу."
        actions={
          <Button onClick={() => navigate('/interview/new')} leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}>
            Новое собеседование
          </Button>
        }
      />

      <Card className="mb-4 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-3"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск по номеру, направлению или уровню"
              aria-label="Поиск по истории"
              className="pl-9"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="w-40">
              <Select
                value={level}
                onChange={(event) => setLevel(event.target.value)}
                aria-label="Фильтр по уровню"
              >
                <option value="all">Любой уровень</option>
                {levelOptions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.title}
                  </option>
                ))}
              </Select>
            </div>
            <Segmented options={STATUS_OPTIONS} value={status} onChange={setStatus} ariaLabel="Фильтр по статусу" />
            {activeFilterCount > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                leftIcon={<RotateCcw className="h-4 w-4" aria-hidden="true" />}
              >
                Сбросить
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-3 border-t border-line pt-3 lg:flex-row lg:items-start lg:justify-between">
          <fieldset className="min-w-0">
            <legend className="mb-1 text-13 text-fg-2">Направление</legend>
            <div className="flex flex-wrap gap-x-1 gap-y-0">
              {roleOptions.map((role) => (
                <Checkbox
                  key={role.code}
                  id={`history-role-${role.code}`}
                  checked={roles.includes(role.code)}
                  onChange={(checked) =>
                    setRoles((previous) =>
                      checked ? [...previous, role.code] : previous.filter((code) => code !== role.code),
                    )
                  }
                  label={labelOf(ROLE_SHORT_LABELS, role.code)}
                  className="w-auto pr-2"
                />
              ))}
            </div>
          </fieldset>

          <div className="w-full shrink-0 lg:w-64">
            <RangeSlider
              min={0}
              max={10}
              step={0.5}
              value={minScore}
              onChange={setMinScore}
              label="Минимальный балл"
              valueLabel={minScore > 0 ? `от ${formatScore(minScore)}` : 'любой'}
              ariaLabel="Минимальный балл сессии"
            />
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between gap-3 border-t border-line pt-2">
          <p className="text-12 text-fg-3">
            Показано {filtered.length} из {items.length} загруженных · всего {total}{' '}
            {plural(total, ['сессия', 'сессии', 'сессий'])}
          </p>
          {activeFilterCount > 0 ? <p className="text-12 text-fg-3">Активных фильтров: {activeFilterCount}</p> : null}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-14 font-semibold text-fg">Собеседования</h2>
          <span className="text-12 text-fg-3">
            {filtered.length} {plural(filtered.length, ['результат', 'результата', 'результатов'])}
          </span>
        </div>

        {loading ? (
          <div className="space-y-px">
            <Skeleton className="h-10 w-full rounded-none" />
            <SkeletonTableRows rows={6} />
          </div>
        ) : error ? (
          <div className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-negative" aria-hidden="true" />
              <div>
                <p className="text-14 font-medium text-fg">Не удалось загрузить историю</p>
                <p className="mt-0.5 text-13 text-fg-2">{error}</p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => void load(0)} leftIcon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}>
              Повторить
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={History}
              title="История пока пуста"
              description="Пройдите первое собеседование — здесь появятся сессии, баллы и отчёты."
              action={
                <Button onClick={() => navigate('/interview/new')} leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}>
                  Начать собеседование
                </Button>
              }
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Search}
              title="Ничего не найдено"
              description="Измените условия фильтра или сбросьте их."
              action={
                <Button variant="secondary" size="sm" onClick={resetFilters}>
                  Сбросить фильтры
                </Button>
              }
            />
          </div>
        ) : (
          <>
            <SessionTable sessions={filtered} onDelete={(session) => setDeleteTarget(session)} />
            <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
              <p className="text-12 text-fg-3">
                Загружено {items.length} из {total}
              </p>
              {items.length < total ? (
                <Button variant="secondary" size="sm" loading={loadingMore} onClick={() => void load(items.length)}>
                  Показать ещё
                </Button>
              ) : null}
            </div>
          </>
        )}
      </Card>

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Удалить сессию?"
        description={
          deleteTarget
            ? `Сессия #${deleteTarget.id} будет удалена вместе с ответами и оценками. Действие нельзя отменить.`
            : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Отмена
            </Button>
            <Button variant="danger" onClick={() => void handleDelete()} loading={deleting}>
              Удалить
            </Button>
          </>
        }
      />
    </div>
  )
}

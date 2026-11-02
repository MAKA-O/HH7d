import { AlertCircle, ArrowRight, Check, Info, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { PageHeader } from '@/components/PageHeader'
import { TopicCombobox } from '@/components/TopicCombobox'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { RangeSlider } from '@/components/ui/RangeSlider'
import { Segmented } from '@/components/ui/Segmented'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAiStatus } from '@/context/AiStatusContext'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { ApiError, api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { plural } from '@/lib/format'
import { LEVEL_LABELS, MODE_LABELS, ROLE_LABELS, labelOf } from '@/lib/labels'
import type { MetaOut } from '@/lib/types'

const MODE_DESCRIPTIONS: Record<string, string> = {
  mixed: 'Теория и практические задачи вперемешку',
  theory: 'Только теоретические вопросы',
  code: 'Только задачи с кодом',
}

const COUNT_PRESETS = [3, 5, 7, 10]

export function NewInterviewPage() {
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const { health, latencyMs, loading: aiLoading, error: aiError } = useAiStatus()

  const [meta, setMeta] = useState<MetaOut | null>(null)
  const [metaLoading, setMetaLoading] = useState(true)
  const [metaError, setMetaError] = useState<string | null>(null)

  const [role, setRole] = useState(user?.target_role ?? 'backend')
  const [level, setLevel] = useState(user?.target_level ?? 'junior')
  const [mode, setMode] = useState('mixed')
  const [questionCount, setQuestionCount] = useState(5)
  const [focusTopics, setFocusTopics] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  const loadMeta = useCallback(async () => {
    setMetaLoading(true)
    setMetaError(null)
    try {
      const loaded = await api.meta()
      setMeta(loaded)
      setRole((current) => (loaded.roles.some((item) => item.code === current) ? current : loaded.roles[0]?.code ?? current))
      setLevel((current) => (loaded.levels.some((item) => item.code === current) ? current : loaded.levels[0]?.code ?? current))
    } catch (caught) {
      setMetaError(
        caught instanceof Error && caught.message
          ? caught.message
          : 'Не удалось загрузить справочники. Проверьте соединение с сервером.',
      )
    } finally {
      setMetaLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadMeta()
  }, [loadMeta])

  const selectedRole = useMemo(() => meta?.roles.find((item) => item.code === role) ?? null, [meta, role])
  const topics = selectedRole?.topics ?? []

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      const session = await api.interviews.create({
        role,
        level,
        mode,
        question_count: questionCount,
        focus_topics: focusTopics,
      })
      toast.success('Собеседование создано')
      navigate(session.status === 'completed' ? `/interview/${session.id}/report` : `/interview/${session.id}`)
    } catch (caught) {
      toast.error(
        caught instanceof ApiError ? caught.detail : 'Не удалось создать собеседование. Попробуйте ещё раз.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (metaLoading) {
    return (
      <div>
        <PageHeader title="Новая сессия" description="Настройте параметры собеседования." />
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 space-y-4 xl:col-span-8">
            <Skeleton className="h-56 w-full rounded-lg" />
            <Skeleton className="h-28 w-full rounded-lg" />
            <Skeleton className="h-36 w-full rounded-lg" />
          </div>
          <div className="col-span-12 xl:col-span-4">
            <Skeleton className="h-72 w-full rounded-lg" />
          </div>
        </div>
      </div>
    )
  }

  if (metaError || !meta) {
    return (
      <div>
        <PageHeader title="Новая сессия" description="Настройте параметры собеседования." />
        <Card className="border-negative/25 p-4">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-negative" aria-hidden="true" />
              <div>
                <p className="text-14 font-medium text-fg">Справочники недоступны</p>
                <p className="mt-0.5 text-13 text-fg-2">{metaError ?? 'Повторите попытку позже.'}</p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => void loadMeta()} leftIcon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}>
              Повторить
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  const aiTone = aiError ? 'bg-negative' : health?.mode === 'live' ? 'bg-positive' : health ? 'bg-caution' : 'bg-fg-3'
  const aiLabel = aiError
    ? 'ИИ-движок недоступен'
    : health?.mode === 'live'
      ? `ИИ в сети${latencyMs != null ? ` · ${latencyMs} мс` : ''}`
      : health
        ? `Офлайн-режим${latencyMs != null ? ` · ${latencyMs} мс` : ''}`
        : 'Проверяем ИИ-движок…'

  return (
    <div>
      <PageHeader
        title="Новая сессия"
        description="Выберите направление, уровень и формат — вопросы будут готовы сразу после старта."
      />

      <form onSubmit={handleSubmit} className="grid grid-cols-12 gap-4">
        <div className="col-span-12 space-y-4 xl:col-span-8">
          <Card className="p-5">
            <CardHeader title="Направление" description="Определяет темы и банк вопросов" />
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Направление">
              {meta.roles.map((item) => {
                const active = item.code === role
                return (
                  <button
                    key={item.code}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => {
                      setRole(item.code)
                      setFocusTopics([])
                    }}
                    className={cn(
                      'rounded-md border p-3 text-left transition-colors',
                      active
                        ? 'border-accent bg-accent-soft'
                        : 'border-line bg-surface hover:border-line-strong hover:bg-surface-2',
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className={cn('text-13 font-medium', active ? 'text-accent' : 'text-fg')}>
                        {item.title || labelOf(ROLE_LABELS, item.code)}
                      </span>
                      {active ? <Check className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" /> : null}
                    </span>
                    {item.description ? (
                      <span className="mt-1 block text-12 leading-relaxed text-fg-3">{item.description}</span>
                    ) : null}
                    {item.topics.length > 0 ? (
                      <span className="mt-1.5 block text-12 text-fg-3">{item.topics.length} тем в программе</span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          </Card>

          <Card className="p-5">
            <CardHeader title="Уровень" description="Сложность и глубина вопросов" />
            <Segmented
              fullWidth
              options={meta.levels.map((item) => ({ value: item.code, label: item.title || labelOf(LEVEL_LABELS, item.code) }))}
              value={level}
              onChange={setLevel}
              ariaLabel="Уровень сложности"
            />
          </Card>

          <Card className="p-5">
            <CardHeader title="Режим" description="Какие вопросы включать в сессию" />
            <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Режим собеседования">
              {meta.modes.map((item) => {
                const active = item.code === mode
                return (
                  <button
                    key={item.code}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setMode(item.code)}
                    className={cn(
                      'rounded-md border p-3 text-left transition-colors',
                      active
                        ? 'border-accent bg-accent-soft'
                        : 'border-line bg-surface hover:border-line-strong hover:bg-surface-2',
                    )}
                  >
                    <span className={cn('block text-13 font-medium', active ? 'text-accent' : 'text-fg')}>
                      {item.title || labelOf(MODE_LABELS, item.code)}
                    </span>
                    <span className="mt-1 block text-12 leading-relaxed text-fg-3">
                      {MODE_DESCRIPTIONS[item.code] ?? 'Смешанный формат'}
                    </span>
                  </button>
                )
              })}
            </div>
          </Card>

          <Card className="p-5">
            <CardHeader
              title="Количество вопросов"
              description="От 3 до 15; по ходу можно добавить адаптивный вопрос"
              action={<span className="text-24 font-semibold tabular-nums text-fg">{questionCount}</span>}
            />
            <RangeSlider
              min={3}
              max={15}
              step={1}
              value={questionCount}
              onChange={setQuestionCount}
              ariaLabel="Количество вопросов"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {COUNT_PRESETS.map((count) => (
                <Button
                  key={count}
                  type="button"
                  variant={questionCount === count ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setQuestionCount(count)}
                >
                  {count} {plural(count, ['вопрос', 'вопроса', 'вопросов'])}
                </Button>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <CardHeader
              title="Фокус-темы"
              description="Необязательно: ИИ сделает акцент на выбранных темах"
              action={
                focusTopics.length > 0 ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setFocusTopics([])}>
                    Сбросить
                  </Button>
                ) : null
              }
            />
            <TopicCombobox options={topics} selected={focusTopics} onChange={setFocusTopics} />
            <p className="mt-2 text-12 leading-relaxed text-fg-3">
              Начните вводить тему — появятся подсказки. Enter добавляет введённый текст как свою тему,
              Backspace убирает последнюю.
            </p>
          </Card>
        </div>

        <div className="col-span-12 xl:col-span-4">
          <div className="space-y-4 xl:sticky xl:top-[72px]">
            <Card className="p-5">
              <h2 className="text-14 font-semibold text-fg">Параметры сессии</h2>
              <dl className="mt-3 divide-y divide-line text-13">
                <div className="flex items-baseline justify-between gap-3 py-2">
                  <dt className="text-fg-2">Направление</dt>
                  <dd className="text-right font-medium text-fg">
                    {selectedRole?.title || labelOf(ROLE_LABELS, role)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 py-2">
                  <dt className="text-fg-2">Уровень</dt>
                  <dd className="font-medium text-fg">{labelOf(LEVEL_LABELS, level)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 py-2">
                  <dt className="text-fg-2">Режим</dt>
                  <dd className="text-right font-medium text-fg">{labelOf(MODE_LABELS, mode)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 py-2">
                  <dt className="text-fg-2">Вопросов</dt>
                  <dd className="font-medium text-fg">{questionCount}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 py-2">
                  <dt className="text-fg-2">Фокус-темы</dt>
                  <dd className="text-right font-medium text-fg">
                    {focusTopicSummary(focusTopics, topics)}
                  </dd>
                </div>
              </dl>

              <Button
                type="submit"
                fullWidth
                size="lg"
                className="mt-4"
                loading={submitting}
                rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
              >
                Начать собеседование
              </Button>

              <p className="mt-2 flex items-start gap-1.5 text-12 leading-relaxed text-fg-3">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Сессию можно завершить в любой момент — отчёт соберётся по отправленным ответам.
              </p>
            </Card>

            <Card className="p-4">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-surface-2">
                  <span className={cn('h-2 w-2 rounded-full', aiTone, aiLoading && 'animate-pulse')} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-13 font-medium text-fg">ИИ-движок</p>
                  <p className="mt-0.5 text-12 leading-relaxed text-fg-2">{aiLabel}</p>
                  <p className="mt-1.5 text-12 leading-relaxed text-fg-3">
                    {aiError
                      ? 'Проверьте соединение с сервером — сессию можно создать после восстановления связи.'
                      : health?.mode === 'live'
                        ? `Провайдер ${health.provider}, модель ${health.model}.`
                        : 'Офлайн-режим: вопросы из банка, оценки по эвристикам. Весь функционал доступен без ключа API.'}
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </form>
    </div>
  )
}

/** Короткая сводка выбранных фокус-тем для панели параметров. */
function focusTopicSummary(selected: string[], available: string[]): string {
  if (selected.length === 0) return 'все темы'
  if (selected.length === 1) return selected[0]
  const custom = selected.filter((topic) => !available.includes(topic)).length
  return custom > 0 ? `${selected.length}, в т.ч. своя` : `${selected.length} темы`
}

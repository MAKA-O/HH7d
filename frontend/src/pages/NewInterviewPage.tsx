import { ArrowRight, BrainCircuit, Check, Info, Loader2, Sparkles, Wand2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Input } from '@/components/ui/Field'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { ApiError, api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { LEVEL_LABELS, MODE_LABELS, ROLE_LABELS, labelOf } from '@/lib/labels'
import type { AIHealthOut, MetaOut } from '@/lib/types'

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

  const [meta, setMeta] = useState<MetaOut | null>(null)
  const [metaLoading, setMetaLoading] = useState(true)
  const [metaError, setMetaError] = useState<string | null>(null)
  const [aiHealth, setAiHealth] = useState<AIHealthOut | null>(null)

  const [role, setRole] = useState(user?.target_role ?? 'backend')
  const [level, setLevel] = useState(user?.target_level ?? 'junior')
  const [mode, setMode] = useState('mixed')
  const [questionCount, setQuestionCount] = useState(5)
  const [focusTopics, setFocusTopics] = useState<string[]>([])
  const [customTopic, setCustomTopic] = useState('')
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
    let cancelled = false
    api
      .aiHealth()
      .then((health) => {
        if (!cancelled) setAiHealth(health)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [loadMeta])

  const selectedRole = useMemo(() => meta?.roles.find((item) => item.code === role) ?? null, [meta, role])
  const topics = selectedRole?.topics ?? []

  const toggleTopic = (topic: string) => {
    setFocusTopics((current) =>
      current.includes(topic) ? current.filter((item) => item !== topic) : [...current, topic],
    )
  }

  const addCustomTopic = () => {
    const trimmed = customTopic.trim()
    if (!trimmed) return
    setFocusTopics((current) => (current.includes(trimmed) ? current : [...current, trimmed]))
    setCustomTopic('')
  }

  const handleCustomTopicKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    addCustomTopic()
  }

  const customFocusTopics = focusTopics.filter((topic) => !topics.includes(topic))

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
      toast.success('Собеседование создано — вопросы готовы')
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
        <PageHeader eyebrow="Новое собеседование" title="Настройка сессии" description="Загружаем справочники…" />
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <Skeleton className="h-64 w-full rounded-2xl" />
            <Skeleton className="h-40 w-full rounded-2xl" />
            <Skeleton className="h-40 w-full rounded-2xl" />
          </div>
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
      </div>
    )
  }

  if (metaError || !meta) {
    return (
      <div>
        <PageHeader eyebrow="Новое собеседование" title="Настройка сессии" />
        <Card className="border-rose-500/25 bg-rose-500/[0.04]">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-rose-100">Справочники недоступны</p>
                <p className="mt-0.5 text-xs text-rose-200/70">{metaError ?? 'Повторите попытку позже.'}</p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => void loadMeta()} leftIcon={<Loader2 className="h-4 w-4" />}>
              Повторить
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        eyebrow="Новое собеседование"
        title="Настройка сессии"
        description="Выберите направление, уровень и формат — ИИ подготовит вопросы и оценит каждый ответ."
      />

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Направление */}
          <Card>
            <CardHeader
              title="Направление"
              description="Определяет тематику вопросов"
              icon={<BrainCircuit className="h-4 w-4" />}
            />
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {meta.roles.map((item) => {
                const active = item.code === role
                return (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => {
                      setRole(item.code)
                      setFocusTopics([])
                    }}
                    aria-pressed={active}
                    className={cn(
                      'rounded-xl border p-3.5 text-left transition',
                      active
                        ? 'border-accent-400/50 bg-accent-500/10 shadow-[inset_0_0_0_1px_rgba(129,140,248,0.25)]'
                        : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn('text-sm font-medium', active ? 'text-accent-100' : 'text-slate-200')}>
                        {item.title || labelOf(ROLE_LABELS, item.code)}
                      </span>
                      {active ? <Check className="h-4 w-4 shrink-0 text-accent-300" aria-hidden="true" /> : null}
                    </div>
                    {item.description ? (
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">{item.description}</p>
                    ) : null}
                    {item.topics.length > 0 ? (
                      <p className="mt-1.5 text-[11px] text-slate-600">{item.topics.length} тем в программе</p>
                    ) : null}
                  </button>
                )
              })}
            </div>
          </Card>

          {/* Уровень */}
          <Card>
            <CardHeader title="Уровень" description="Сложность и глубина вопросов" icon={<Sparkles className="h-4 w-4" />} />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {meta.levels.map((item) => {
                const active = item.code === level
                return (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => setLevel(item.code)}
                    aria-pressed={active}
                    className={cn(
                      'rounded-xl border px-3 py-2.5 text-sm font-medium transition',
                      active
                        ? 'border-accent-400/50 bg-accent-500/10 text-accent-100'
                        : 'border-white/10 bg-white/[0.02] text-slate-300 hover:border-white/20 hover:bg-white/[0.04]',
                    )}
                  >
                    {item.title || labelOf(LEVEL_LABELS, item.code)}
                  </button>
                )
              })}
            </div>
          </Card>

          {/* Режим */}
          <Card>
            <CardHeader title="Режим" description="Какие вопросы задавать" icon={<Wand2 className="h-4 w-4" />} />
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {meta.modes.map((item) => {
                const active = item.code === mode
                return (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => setMode(item.code)}
                    aria-pressed={active}
                    className={cn(
                      'rounded-xl border p-3.5 text-left transition',
                      active
                        ? 'border-accent-400/50 bg-accent-500/10'
                        : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]',
                    )}
                  >
                    <p className={cn('text-sm font-medium', active ? 'text-accent-100' : 'text-slate-200')}>
                      {item.title || labelOf(MODE_LABELS, item.code)}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">
                      {MODE_DESCRIPTIONS[item.code] ?? 'Смешанный формат'}
                    </p>
                  </button>
                )
              })}
            </div>
          </Card>

          {/* Количество вопросов */}
          <Card>
            <CardHeader
              title="Количество вопросов"
              description="От 3 до 15 — можно добавить вопросы по ходу"
              icon={<ListChecksIcon />}
              action={<span className="text-2xl font-semibold tabular-nums text-slate-50">{questionCount}</span>}
            />
            <input
              type="range"
              min={3}
              max={15}
              step={1}
              value={questionCount}
              onChange={(event) => setQuestionCount(Number(event.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10"
              style={{ accentColor: '#6366f1' }}
              aria-label="Количество вопросов"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {COUNT_PRESETS.map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setQuestionCount(count)}
                  className={cn(
                    'rounded-lg border px-3 py-1.5 text-xs font-medium transition',
                    questionCount === count
                      ? 'border-accent-400/50 bg-accent-500/10 text-accent-100'
                      : 'border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/20 hover:text-slate-200',
                  )}
                >
                  {count} вопр.
                </button>
              ))}
            </div>
          </Card>

          {/* Фокус-темы */}
          <Card>
            <CardHeader
              title="Фокус-темы"
              description="Необязательно: ИИ сделает акцент на выбранных темах"
              icon={<TargetIcon />}
              action={
                focusTopics.length > 0 ? (
                  <Button variant="ghost" size="sm" onClick={() => setFocusTopics([])}>
                    Сбросить
                  </Button>
                ) : null
              }
            />
            {topics.length === 0 ? (
              <p className="text-sm text-slate-500">Для направления пока нет тем — можно добавить свою ниже.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {topics.map((topic) => {
                  const active = focusTopics.includes(topic)
                  return (
                    <button
                      key={topic}
                      type="button"
                      onClick={() => toggleTopic(topic)}
                      aria-pressed={active}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-xs font-medium transition',
                        active
                          ? 'border-accent-400/50 bg-accent-500/15 text-accent-100'
                          : 'border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/20 hover:text-slate-200',
                      )}
                    >
                      {active ? '✓ ' : ''}
                      {topic}
                    </button>
                  )
                })}
              </div>
            )}

            {customFocusTopics.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {customFocusTopics.map((topic) => (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => toggleTopic(topic)}
                    className="rounded-full border border-violet-400/40 bg-violet-500/15 px-3 py-1.5 text-xs font-medium text-violet-200 transition hover:bg-violet-500/25"
                  >
                    {topic} ×
                  </button>
                ))}
              </div>
            ) : null}

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Input
                value={customTopic}
                onChange={(event) => setCustomTopic(event.target.value)}
                onKeyDown={handleCustomTopicKeyDown}
                placeholder="Своя тема, например «Транзакции в PostgreSQL»"
                aria-label="Своя фокус-тема"
              />
              <Button variant="secondary" onClick={addCustomTopic} disabled={!customTopic.trim()}>
                Добавить
              </Button>
            </div>
          </Card>
        </div>

        {/* Правая колонка */}
        <div className="space-y-5">
          <Card className="sticky top-6">
            <CardHeader title="Ваша сессия" icon={<Sparkles className="h-4 w-4" />} />
            <dl className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Направление</dt>
                <dd className="text-right font-medium text-slate-200">
                  {selectedRole?.title || labelOf(ROLE_LABELS, role)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Уровень</dt>
                <dd className="font-medium text-slate-200">{labelOf(LEVEL_LABELS, level)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Режим</dt>
                <dd className="text-right font-medium text-slate-200">{labelOf(MODE_LABELS, mode)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Вопросов</dt>
                <dd className="font-medium text-slate-200">{questionCount}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Фокус-темы</dt>
                <dd className="text-right font-medium text-slate-200">
                  {focusTopics.length > 0 ? focusTopics.length : 'все'}
                </dd>
              </div>
            </dl>

            <Button
              type="submit"
              fullWidth
              size="lg"
              className="mt-5"
              loading={submitting}
              rightIcon={<ArrowRight className="h-4 w-4" />}
            >
              Начать собеседование
            </Button>

            <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-500">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              После старта вопросы генерируются сразу. Сессию можно завершить в любой момент.
            </p>
          </Card>

          {aiHealth ? (
            <Card className="p-4">
              <div className="flex items-start gap-2.5">
                <span
                  className={cn(
                    'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
                    aiHealth.mode === 'live'
                      ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
                      : 'border-amber-500/25 bg-amber-500/10 text-amber-300',
                  )}
                >
                  <BrainCircuit className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-slate-200">ИИ-движок</p>
                    <Badge tone={aiHealth.mode === 'live' ? 'success' : 'warning'}>
                      {aiHealth.mode === 'live' ? 'live' : 'offline'}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    {aiHealth.mode === 'live'
                      ? `Модель ${aiHealth.model} (${aiHealth.provider}) — живые ответы и оценки.`
                      : 'Офлайн-движок: вопросы из встроенного банка, оценки по эвристикам. Все функции доступны.'}
                  </p>
                </div>
              </div>
            </Card>
          ) : null}

          <Card>
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-500">Как это работает</p>
            <ol className="space-y-3">
              {[
                'ИИ задаёт вопрос по выбранной теме и сложности.',
                'Вы отвечаете текстом или голосом — таймер фиксирует время.',
                'ИИ оценивает ответ по четырём критериям и даёт эталонный разбор.',
                'В конце — отчёт с итоговым баллом и рекомендациями.',
              ].map((step, index) => (
                <li key={step} className="flex gap-2.5 text-sm leading-relaxed text-slate-400">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[11px] font-semibold text-accent-300">
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </form>
    </div>
  )
}

/** Небольшие иконки-обёртки, чтобы не плодить импорты в разметке. */
function ListChecksIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M11 12H3M11 18H3M11 6H3M18 12l-3 3 3 3M21 6l-3 3 3 3" />
    </svg>
  )
}

function TargetIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 1v3M12 20v3M1 12h3M20 12h3" />
    </svg>
  )
}

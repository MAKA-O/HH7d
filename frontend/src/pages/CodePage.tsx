import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Copy,
  FileCode2,
  History,
  Lightbulb,
  Loader2,
  Play,
  Sparkles,
  Wand2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { CodeEditor } from '@/components/CodeEditor'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field, Input, Select } from '@/components/ui/Field'
import { RichText } from '@/components/ui/RichText'
import { ScoreRing } from '@/components/ui/ScoreRing'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/context/ToastContext'
import { ApiError, api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { formatDate, formatScore } from '@/lib/format'
import {
  CODE_TOPIC_SUGGESTIONS,
  DIFFICULTY_LABELS,
  LANGUAGES,
  SEVERITY_LABELS,
  SEVERITY_ORDER,
  difficultyClasses,
  labelOf,
  severityClasses,
} from '@/lib/labels'
import type { CodeReviewOut, CodeTaskOut } from '@/lib/types'

const DIFFICULTIES = ['easy', 'medium', 'hard']

export function CodePage() {
  const toast = useToast()

  const [task, setTask] = useState<CodeTaskOut | null>(null)
  const [code, setCode] = useState('')
  const [review, setReview] = useState<CodeReviewOut | null>(null)
  const [generating, setGenerating] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [openingHistory, setOpeningHistory] = useState<number | null>(null)
  const [showHints, setShowHints] = useState(false)

  const [topic, setTopic] = useState('')
  const [language, setLanguage] = useState('python')
  const [difficulty, setDifficulty] = useState('medium')

  const [history, setHistory] = useState<CodeReviewOut[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState<string | null>(null)

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    setHistoryError(null)
    try {
      const data = await api.code.history()
      setHistory(data.items)
    } catch (caught) {
      setHistoryError(
        caught instanceof Error && caught.message ? caught.message : 'Не удалось загрузить историю ревью.',
      )
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  const handleGenerate = async () => {
    if (generating) return
    setGenerating(true)
    try {
      const created = await api.code.createTask({
        topic: topic.trim() ? topic.trim() : null,
        language,
        difficulty,
      })
      setTask(created)
      setCode(created.starter_code || '')
      setReview(null)
      setShowHints(created.hints.length > 0)
      setTopic(created.topic || topic)
      toast.success('Задача сгенерирована — приступайте к решению')
    } catch (caught) {
      toast.error(
        caught instanceof ApiError ? caught.detail : 'Не удалось сгенерировать задачу. Попробуйте ещё раз.',
      )
    } finally {
      setGenerating(false)
    }
  }

  const handleReview = async () => {
    if (!task || reviewing) return
    if (!code.trim()) {
      toast.error('Напишите решение перед отправкой на ревью.')
      return
    }
    setReviewing(true)
    try {
      const result = await api.code.review(task.id, code)
      setReview(result)
      toast.success('ИИ разобрал решение')
      void loadHistory()
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.detail : 'Не удалось получить ревью. Попробуйте ещё раз.')
    } finally {
      setReviewing(false)
    }
  }

  const handleOpenHistory = async (item: CodeReviewOut) => {
    if (item.task_id == null) {
      toast.info('Для этого ревью задача недоступна — она была удалена.')
      return
    }
    if (openingHistory != null) return
    setOpeningHistory(item.id)
    try {
      const loaded = await api.code.getTask(item.task_id)
      setTask(loaded)
      setCode('')
      setReview(item)
      setShowHints(false)
      toast.info('Открыто ревью из истории')
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.detail : 'Не удалось открыть задачу из истории.')
    } finally {
      setOpeningHistory(null)
    }
  }

  const hints = useMemo(() => task?.hints ?? [], [task])

  return (
    <div>
      <PageHeader
        eyebrow="Практика"
        title="Задачи с кодом"
        description="Сгенерируйте задачу под свою тему и получите разбор решения: оценка, замечания по severity и улучшенный код."
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Левая колонка: генерация и история */}
        <div className="space-y-5">
          <Card>
            <CardHeader title="Новая задача" description="ИИ придумает задачу под ваши параметры" icon={<Wand2 className="h-4 w-4" />} />
            <div className="space-y-4">
              <Field label="Тема" htmlFor="code_topic" hint="Необязательно: пусто — тема из вашего профиля">
                <Input
                  id="code_topic"
                  list="code_topic_suggestions"
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  placeholder="Алгоритмы и структуры данных"
                />
                <datalist id="code_topic_suggestions">
                  {CODE_TOPIC_SUGGESTIONS.map((suggestion) => (
                    <option key={suggestion} value={suggestion} />
                  ))}
                </datalist>
              </Field>

              <Field label="Язык" htmlFor="code_language">
                <Select id="code_language" value={language} onChange={(event) => setLanguage(event.target.value)}>
                  {LANGUAGES.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.title}
                    </option>
                  ))}
                </Select>
              </Field>

              <div className="space-y-1.5">
                <span className="text-sm font-medium text-slate-300">Сложность</span>
                <div className="grid grid-cols-3 gap-2">
                  {DIFFICULTIES.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setDifficulty(item)}
                      aria-pressed={difficulty === item}
                      className={cn(
                        'rounded-lg border px-2 py-2 text-xs font-medium transition',
                        difficulty === item
                          ? 'border-accent-400/50 bg-accent-500/10 text-accent-100'
                          : 'border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/20 hover:text-slate-200',
                      )}
                    >
                      {labelOf(DIFFICULTY_LABELS, item)}
                    </button>
                  ))}
                </div>
              </div>

              <Button fullWidth loading={generating} onClick={() => void handleGenerate()} leftIcon={<Sparkles className="h-4 w-4" />}>
                Сгенерировать задачу
              </Button>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="История ревью"
              description="Недавние разборы"
              icon={<History className="h-4 w-4" />}
              action={<Badge>{history.length}</Badge>}
            />
            {historyLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full rounded-xl" />
                <Skeleton className="h-12 w-full rounded-xl" />
              </div>
            ) : historyError ? (
              <div className="space-y-2">
                <p className="text-xs text-rose-300">{historyError}</p>
                <Button variant="secondary" size="sm" onClick={() => void loadHistory()}>
                  Повторить
                </Button>
              </div>
            ) : history.length === 0 ? (
              <EmptyState
                compact
                icon={History}
                title="Ревью пока не было"
                description="Отправьте первое решение — здесь появятся разборы."
              />
            ) : (
              <div className="space-y-1.5">
                {history.slice(0, 8).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => void handleOpenHistory(item)}
                    className="flex w-full items-center gap-2.5 rounded-xl border border-transparent px-2 py-2 text-left transition hover:border-white/10 hover:bg-white/[0.03]"
                  >
                    <span
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-xs font-semibold tabular-nums',
                        item.score >= 7
                          ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
                          : item.score >= 4
                            ? 'border-amber-500/25 bg-amber-500/10 text-amber-300'
                            : 'border-rose-500/25 bg-rose-500/10 text-rose-300',
                      )}
                    >
                      {formatScore(item.score)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs text-slate-300">{item.verdict || 'Ревью решения'}</span>
                      <span className="block text-[10px] text-slate-500">
                        {formatDate(item.created_at)} · {item.issues.length} замеч.
                      </span>
                    </span>
                    {openingHistory === item.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" aria-hidden="true" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-slate-600" aria-hidden="true" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Правая колонка: задача, редактор, ревью */}
        <div className="space-y-5 lg:col-span-2">
          {generating && !task ? (
            <Card>
              <div className="space-y-3">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-5/6" />
                <Skeleton className="h-40 w-full rounded-xl" />
              </div>
            </Card>
          ) : !task ? (
            <Card>
              <EmptyState
                icon={FileCode2}
                title="Задача ещё не выбрана"
                description="Укажите тему, язык и сложность слева — ИИ сгенерирует задачу с описанием, подсказками и шаблоном кода."
                action={
                  <Button onClick={() => void handleGenerate()} loading={generating} leftIcon={<Sparkles className="h-4 w-4" />}>
                    Сгенерировать задачу
                  </Button>
                }
              />
            </Card>
          ) : (
            <>
              <Card>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Badge tone="accent">{task.topic}</Badge>
                  <Badge tone="info">{task.language}</Badge>
                  <Badge className={difficultyClasses(task.difficulty)}>{labelOf(DIFFICULTY_LABELS, task.difficulty)}</Badge>
                </div>
                <h2 className="text-lg font-semibold text-slate-50">{task.title}</h2>
                <div className="mt-2">
                  <RichText text={task.description} />
                </div>

                {hints.length > 0 ? (
                  <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02]">
                    <button
                      type="button"
                      onClick={() => setShowHints((value) => !value)}
                      aria-expanded={showHints}
                      className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left"
                    >
                      <span className="flex items-center gap-2 text-sm font-medium text-slate-200">
                        <Lightbulb className="h-4 w-4 text-amber-300" aria-hidden="true" />
                        Подсказки ({hints.length})
                      </span>
                      <ChevronDown
                        className={cn('h-4 w-4 text-slate-500 transition', showHints ? 'rotate-180' : '')}
                        aria-hidden="true"
                      />
                    </button>
                    {showHints ? (
                      <ul className="space-y-2 border-t border-white/5 px-3.5 py-3">
                        {hints.map((hint, index) => (
                          <li key={index} className="flex gap-2 text-xs leading-relaxed text-slate-400">
                            <span className="text-amber-300">{index + 1}.</span>
                            {hint}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </Card>

              <Card>
                <CardHeader
                  title="Ваше решение"
                  description="Пишите код в редакторе — ИИ разберёт его без запуска"
                  icon={<FileCode2 className="h-4 w-4" />}
                  action={
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCode(task.starter_code || '')}
                      disabled={!task.starter_code}
                    >
                      Вставить шаблон
                    </Button>
                  }
                />
                <CodeEditor value={code} onChange={setCode} minRows={14} disabled={reviewing} />
                <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-xs text-slate-600">{code.split('\n').length} строк</span>
                  <Button
                    onClick={() => void handleReview()}
                    loading={reviewing}
                    disabled={!code.trim()}
                    leftIcon={<Play className="h-4 w-4" />}
                  >
                    Проверить решение
                  </Button>
                </div>
              </Card>

              {review ? <ReviewPanel review={review} /> : null}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** Панель ИИ-ревью: оценка, замечания по severity, сложность и улучшенный код. */
function ReviewPanel({ review }: { review: CodeReviewOut }) {
  const [copied, setCopied] = useState(false)

  const issues = useMemo(
    () =>
      [...review.issues].sort(
        (first, second) => SEVERITY_ORDER.indexOf(first.severity) - SEVERITY_ORDER.indexOf(second.severity),
      ),
    [review.issues],
  )

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(review.improved_code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      // Копирование недоступно — код можно выделить вручную.
    }
  }

  return (
    <Card>
      <CardHeader
        title="ИИ-ревью решения"
        description="Оценка, замечания и улучшенный вариант"
        icon={<Sparkles className="h-4 w-4" />}
      />

      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="flex shrink-0 justify-center sm:block">
          <ScoreRing score={review.score} size={96} label="качество" />
        </div>
        <div className="min-w-0 flex-1 space-y-2.5">
          <p className="text-sm leading-relaxed text-slate-200">{review.verdict || 'Разбор решения готов.'}</p>
          {review.correctness_notes ? (
            <p className="text-sm leading-relaxed text-slate-400">{review.correctness_notes}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {review.time_complexity ? <Badge tone="info">Время: {review.time_complexity}</Badge> : null}
            {review.space_complexity ? <Badge tone="violet">Память: {review.space_complexity}</Badge> : null}
            <Badge tone={issues.length > 0 ? 'warning' : 'success'}>
              {issues.length > 0 ? `${issues.length} замечаний` : 'Замечаний нет'}
            </Badge>
          </div>
        </div>
      </div>

      {issues.length > 0 ? (
        <div className="mt-5 space-y-2.5">
          {issues.map((issue, index) => (
            <div key={index} className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={severityClasses(issue.severity)}>
                  {labelOf(SEVERITY_LABELS, issue.severity)}
                </Badge>
                <p className="text-sm font-medium text-slate-200">{issue.title}</p>
              </div>
              {issue.detail ? (
                <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{issue.detail}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-5 flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] px-3.5 py-3 text-sm text-emerald-200">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          Существенных замечаний нет — решение выглядит корректным.
        </div>
      )}

      {review.improved_code ? (
        <div className="mt-5 overflow-hidden rounded-xl border border-white/10 bg-ink-950/80">
          <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
            <span className="text-[11px] uppercase tracking-wider text-slate-500">Улучшенный вариант</span>
            <Button variant="ghost" size="sm" onClick={() => void handleCopy()} leftIcon={<Copy className="h-3.5 w-3.5" />}>
              {copied ? 'Скопировано' : 'Копировать'}
            </Button>
          </div>
          <pre className="max-h-96 overflow-auto p-3 font-mono text-xs leading-relaxed text-slate-200">
            <code>{review.improved_code}</code>
          </pre>
        </div>
      ) : null}
    </Card>
  )
}

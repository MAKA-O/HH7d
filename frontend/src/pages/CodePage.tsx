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
  RefreshCw,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { CodeEditor } from '@/components/CodeEditor'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field, Input, Select } from '@/components/ui/Field'
import { RichText } from '@/components/ui/RichText'
import { ScoreRing } from '@/components/ui/ScoreRing'
import { Skeleton, SkeletonTableRows } from '@/components/ui/Skeleton'
import { Tabs } from '@/components/ui/Tabs'
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

type CodeTab = 'task' | 'reviews'

export function CodePage() {
  const toast = useToast()

  const [tab, setTab] = useState<CodeTab>('task')

  const [task, setTask] = useState<CodeTaskOut | null>(null)
  const [code, setCode] = useState('')
  const [review, setReview] = useState<CodeReviewOut | null>(null)
  const [generating, setGenerating] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [openingHistory, setOpeningHistory] = useState<number | null>(null)
  const [showHints, setShowHints] = useState(true)

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
      toast.success('Задача готова — можно писать решение')
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.detail : 'Не удалось сгенерировать задачу. Попробуйте ещё раз.')
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
      setTab('task')
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.detail : 'Не удалось открыть задачу из истории.')
    } finally {
      setOpeningHistory(null)
    }
  }

  const hints = useMemo(() => task?.hints ?? [], [task])

  const tabs = useMemo(
    () => [
      { id: 'task', label: 'Задача' },
      { id: 'reviews', label: 'История ревью', count: history.length },
    ],
    [history.length],
  )

  return (
    <div>
      <PageHeader
        title="Задачи с кодом"
        description="Сгенерируйте задачу по своей теме и получите разбор: оценка, замечания и улучшенный вариант."
      />

      <Tabs items={tabs} value={tab} onChange={(id) => setTab(id as CodeTab)} ariaLabel="Разделы задач с кодом" />

      <div className="mt-5" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'reviews' ? (
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <h2 className="text-14 font-semibold text-fg">История ревью</h2>
              <span className="text-12 text-fg-3">Всего {history.length}</span>
            </div>

            {historyLoading ? (
              <SkeletonTableRows rows={5} />
            ) : historyError ? (
              <div className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-negative" aria-hidden="true" />
                  <p className="text-13 text-fg-2">{historyError}</p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => void loadHistory()} leftIcon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}>
                  Повторить
                </Button>
              </div>
            ) : history.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={History}
                  title="Ревью пока не было"
                  description="Сгенерируйте задачу, напишите решение и отправьте его на разбор."
                  action={<Button onClick={() => setTab('task')}>Перейти к задаче</Button>}
                />
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {history.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => void handleOpenHistory(item)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2"
                    >
                      <span className="w-14 shrink-0 text-12 text-fg-3">{formatDate(item.created_at)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-13 font-medium text-fg">{item.verdict || `Ревью #${item.id}`}</span>
                        <span className="block text-12 text-fg-3">
                          {item.task_id != null ? `Задача #${item.task_id}` : 'Задача удалена'} · замечаний: {item.issues.length}
                        </span>
                      </span>
                      <span className="shrink-0 text-14 font-semibold tabular-nums text-fg">{formatScore(item.score)}</span>
                      {openingHistory === item.id ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-fg-3" aria-hidden="true" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-fg-3" aria-hidden="true" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : (
          <div className="space-y-4">
            {/* Параметры генерации */}
            <Card className="p-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:items-end">
                <div className="md:col-span-5">
                  <Field label="Тема" htmlFor="code_topic" hint="Пусто — тема из вашего профиля">
                    <Input
                      id="code_topic"
                      list="code_topic_suggestions"
                      value={topic}
                      onChange={(event) => setTopic(event.target.value)}
                      placeholder="SQL и базы данных"
                    />
                    <datalist id="code_topic_suggestions">
                      {CODE_TOPIC_SUGGESTIONS.map((suggestion) => (
                        <option key={suggestion} value={suggestion} />
                      ))}
                    </datalist>
                  </Field>
                </div>
                <div className="md:col-span-3">
                  <Field label="Язык" htmlFor="code_language">
                    <Select id="code_language" value={language} onChange={(event) => setLanguage(event.target.value)}>
                      {LANGUAGES.map((item) => (
                        <option key={item.code} value={item.code}>
                          {item.title}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <div className="md:col-span-2">
                  <Field label="Сложность" htmlFor="code_difficulty">
                    <Select id="code_difficulty" value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
                      {DIFFICULTIES.map((item) => (
                        <option key={item} value={item}>
                          {labelOf(DIFFICULTY_LABELS, item)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <div className="md:col-span-2">
                  <Button fullWidth loading={generating} onClick={() => void handleGenerate()}>
                    Сгенерировать
                  </Button>
                </div>
              </div>
            </Card>

            {!task ? (
              <Card>
                {generating ? (
                  <div className="space-y-3 p-5">
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-5/6" />
                    <Skeleton className="h-40 w-full rounded-md" />
                  </div>
                ) : (
                  <EmptyState
                    icon={FileCode2}
                    title="Задача ещё не выбрана"
                    description="Укажите тему, язык и сложность и нажмите «Сгенерировать» — ИИ подготовит условие, подсказки и шаблон кода."
                    action={
                      <Button onClick={() => void handleGenerate()} loading={generating}>
                        Сгенерировать задачу
                      </Button>
                    }
                  />
                )}
              </Card>
            ) : (
              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-12 space-y-4 xl:col-span-8">
                  {/* Условие */}
                  <Card className="p-5">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <Badge tone="accent">{task.topic}</Badge>
                      <Badge>{task.language}</Badge>
                      <Badge className={difficultyClasses(task.difficulty)}>{labelOf(DIFFICULTY_LABELS, task.difficulty)}</Badge>
                    </div>
                    <h2 className="text-16 font-semibold text-fg">{task.title}</h2>
                    <div className="mt-2">
                      <RichText text={task.description} />
                    </div>
                  </Card>

                  {/* Решение */}
                  <Card className="p-5">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <h2 className="text-14 font-semibold text-fg">Ваше решение</h2>
                        <p className="mt-0.5 text-12 text-fg-3">ИИ разберёт код без запуска</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setCode(task.starter_code || '')}
                        disabled={!task.starter_code}
                      >
                        Вставить шаблон
                      </Button>
                    </div>

                    <CodeEditor value={code} onChange={setCode} minRows={14} disabled={reviewing} />

                    <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-12 text-fg-3">
                        {code.split('\n').length} строк · {code.length} символов
                      </span>
                      <Button
                        onClick={() => void handleReview()}
                        loading={reviewing}
                        disabled={!code.trim()}
                        leftIcon={<Play className="h-4 w-4" aria-hidden="true" />}
                      >
                        Проверить решение
                      </Button>
                    </div>
                  </Card>

                  {review ? <ReviewPanel review={review} /> : null}
                </div>

                {/* Боковая панель */}
                <div className="col-span-12 space-y-4 xl:col-span-4">
                  {hints.length > 0 ? (
                    <Card className="p-4">
                      <button
                        type="button"
                        onClick={() => setShowHints((value) => !value)}
                        aria-expanded={showHints}
                        className="flex w-full items-center justify-between gap-2"
                      >
                        <span className="flex items-center gap-2 text-14 font-semibold text-fg">
                          <Lightbulb className="h-4 w-4 text-caution" aria-hidden="true" />
                          Подсказки
                        </span>
                        <ChevronDown
                          className={cn('h-4 w-4 text-fg-3 transition-transform', showHints && 'rotate-180')}
                          aria-hidden="true"
                        />
                      </button>
                      {showHints ? (
                        <ol className="mt-3 space-y-2">
                          {hints.map((hint, index) => (
                            <li key={index} className="flex gap-2 text-13 leading-relaxed text-fg-2">
                              <span className="text-fg-3">{index + 1}.</span>
                              {hint}
                            </li>
                          ))}
                        </ol>
                      ) : null}
                    </Card>
                  ) : null}

                  <Card className="p-4">
                    <p className="text-12 font-semibold uppercase tracking-wide text-fg-2">Как проходит ревью</p>
                    <ul className="mt-2 space-y-2 text-13 leading-relaxed text-fg-2">
                      <li>Оценка корректности и сложности решения.</li>
                      <li>Замечания по severity с пояснениями.</li>
                      <li>Улучшенный вариант и подсказки, что изучить.</li>
                    </ul>
                    <p className="mt-2 text-12 leading-relaxed text-fg-3">
                      Код не выполняется: ИИ анализирует его как текст, поэтому проверка не заменяет тесты.
                    </p>
                  </Card>
                </div>
              </div>
            )}
          </div>
        )}
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
    <Card className="p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex shrink-0 justify-center sm:block">
          <ScoreRing score={review.score} size={88} label="качество" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={issues.length > 0 ? 'caution' : 'positive'}>
              {issues.length > 0 ? `${issues.length} замечаний` : 'Замечаний нет'}
            </Badge>
            {review.time_complexity ? <Badge tone="accent">Время: {review.time_complexity}</Badge> : null}
            {review.space_complexity ? <Badge>Память: {review.space_complexity}</Badge> : null}
          </div>
          <p className="text-13 leading-relaxed text-fg">{review.verdict || 'Разбор решения готов.'}</p>
          {review.correctness_notes ? (
            <p className="text-13 leading-relaxed text-fg-2">{review.correctness_notes}</p>
          ) : null}
        </div>
      </div>

      {issues.length > 0 ? (
        <div className="mt-4 space-y-2">
          {issues.map((issue, index) => (
            <div key={index} className="rounded-md border border-line p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={severityClasses(issue.severity)}>{labelOf(SEVERITY_LABELS, issue.severity)}</Badge>
                <p className="text-13 font-medium text-fg">{issue.title}</p>
              </div>
              {issue.detail ? <p className="mt-1.5 text-13 leading-relaxed text-fg-2">{issue.detail}</p> : null}
            </div>
          ))}
        </div>
      ) : null}

      {review.improved_code ? (
        <div className="mt-4 overflow-hidden rounded-md border border-line">
          <div className="flex items-center justify-between border-b border-line bg-surface-2 px-3 py-1.5">
            <span className="text-12 text-fg-3">Улучшенный вариант</span>
            <Button variant="ghost" size="sm" onClick={() => void handleCopy()} leftIcon={<Copy className="h-3.5 w-3.5" aria-hidden="true" />}>
              {copied ? 'Скопировано' : 'Копировать'}
            </Button>
          </div>
          <pre className="max-h-96 overflow-auto bg-surface p-3 font-mono text-13 leading-relaxed text-fg">
            <code>{review.improved_code}</code>
          </pre>
        </div>
      ) : null}
    </Card>
  )
}

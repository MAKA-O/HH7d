import {
  AlertCircle,
  ArrowRight,
  Check,
  Clock,
  Copy,
  Lightbulb,
  Mic,
  MicOff,
  Plus,
  RefreshCw,
} from 'lucide-react'
import { useCallback, useEffect, useState, type KeyboardEvent } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'

import { EvaluationPanel } from '@/components/EvaluationPanel'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/context/ToastContext'
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition'
import { ApiError, api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { formatClock, formatScore } from '@/lib/format'
import {
  DIFFICULTY_LABELS,
  LEVEL_LABELS,
  MODE_SHORT_LABELS,
  QUESTION_TYPE_LABELS,
  ROLE_SHORT_LABELS,
  difficultyClasses,
  labelOf,
} from '@/lib/labels'
import type { AnswerResult, SessionDetail } from '@/lib/types'

export function InterviewPage() {
  const { id } = useParams<{ id: string }>()
  const sessionId = Number(id)
  const navigate = useNavigate()
  const toast = useToast()

  const [session, setSession] = useState<SessionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<number, AnswerResult>>({})
  const [answerText, setAnswerText] = useState('')
  const [editing, setEditing] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [finishOpen, setFinishOpen] = useState(false)
  const [addingQuestion, setAddingQuestion] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    if (!Number.isFinite(sessionId) || sessionId <= 0) {
      setError('Некорректный идентификатор собеседования.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const loaded = await api.interviews.get(sessionId)
      const map: Record<number, AnswerResult> = {}
      loaded.answers.forEach((result) => {
        map[result.answer.question_id] = result
      })
      setSession(loaded)
      setAnswers(map)
      const firstUnanswered = loaded.questions.findIndex((question) => !map[question.id])
      const index = firstUnanswered >= 0 ? firstUnanswered : 0
      setCurrentIndex(index)
      const question = loaded.questions[index]
      const existing = question ? map[question.id] : undefined
      setAnswerText(existing?.answer.text ?? '')
      setEditing(false)
      setElapsed(existing?.answer.time_spent_sec ?? 0)
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status === 404
          ? 'Собеседование не найдено или принадлежит другому пользователю.'
          : caught instanceof Error && caught.message
            ? caught.message
            : 'Не удалось загрузить собеседование.',
      )
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    void load()
  }, [load])

  const currentQuestion = session?.questions[currentIndex] ?? null
  const currentAnswer = currentQuestion ? answers[currentQuestion.id] : undefined
  const isAnswered = Boolean(currentAnswer)
  const answeredCount = Object.keys(answers).length
  const questionsTotal = session?.questions.length ?? 0
  const hasNext = currentIndex < questionsTotal - 1

  // Таймер идёт только на вопросе, который ещё не отправлен (или редактируется).
  useEffect(() => {
    if (!currentQuestion) return
    if (answers[currentQuestion.id] && !editing) return
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [currentQuestion, answers, editing])

  const handleTranscript = useCallback((text: string) => {
    setAnswerText((previous) => (previous.trim() ? `${previous.trimEnd()} ${text}` : text))
  }, [])

  const handleSpeechError = useCallback(
    (message: string) => {
      toast.error(message)
    },
    [toast],
  )

  const speech = useSpeechRecognition({ onTranscript: handleTranscript, onError: handleSpeechError })

  const goTo = useCallback(
    (index: number) => {
      if (!session) return
      const question = session.questions[index]
      if (!question) return
      const existing = answers[question.id]
      setCurrentIndex(index)
      setAnswerText(existing?.answer.text ?? '')
      setEditing(false)
      setElapsed(existing?.answer.time_spent_sec ?? 0)
    },
    [answers, session],
  )

  const handleSubmitAnswer = async () => {
    if (!currentQuestion || submitting) return
    const text = answerText.trim()
    if (!text) {
      toast.error('Введите ответ — пустой ответ отправить нельзя.')
      return
    }
    setSubmitting(true)
    try {
      const result = await api.interviews.submitAnswer(sessionId, {
        question_id: currentQuestion.id,
        text,
        time_spent_sec: Math.max(1, elapsed),
      })
      setAnswers((previous) => ({ ...previous, [currentQuestion.id]: result }))
      setAnswerText(result.answer.text)
      setEditing(false)
      toast.success('Ответ отправлен — ИИ оценил его')
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.detail : 'Не удалось отправить ответ. Попробуйте ещё раз.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      void handleSubmitAnswer()
    }
  }

  const handleCopyStarter = async () => {
    if (!currentQuestion?.starter_code) return
    try {
      await navigator.clipboard.writeText(currentQuestion.starter_code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
      toast.success('Шаблон кода скопирован')
    } catch {
      toast.error('Не удалось скопировать автоматически — выделите код вручную.')
    }
  }

  const handleUseStarter = () => {
    if (!currentQuestion?.starter_code) return
    setAnswerText(currentQuestion.starter_code)
    if (isAnswered) setEditing(true)
  }

  const handleStartEdit = () => {
    if (!currentAnswer) return
    setAnswerText(currentAnswer.answer.text)
    setElapsed(currentAnswer.answer.time_spent_sec)
    setEditing(true)
  }

  const handleAddAdaptiveQuestion = async () => {
    if (addingQuestion) return
    setAddingQuestion(true)
    try {
      const question = await api.interviews.nextQuestion(sessionId)
      const nextIndex = questionsTotal
      setSession((previous) =>
        previous
          ? {
              ...previous,
              questions: [...previous.questions, question],
              question_count: previous.question_count + 1,
            }
          : previous,
      )
      setCurrentIndex(nextIndex)
      setAnswerText('')
      setEditing(false)
      setElapsed(0)
      toast.success('Добавлен дополнительный вопрос')
    } catch (caught) {
      toast.error(
        caught instanceof ApiError ? caught.detail : 'Не удалось добавить вопрос. Попробуйте ещё раз.',
      )
    } finally {
      setAddingQuestion(false)
    }
  }

  const handleFinish = async () => {
    if (finishing) return
    setFinishing(true)
    try {
      await api.interviews.finish(sessionId)
      setFinishOpen(false)
      toast.success('Собеседование завершено — отчёт готов')
      navigate(`/interview/${sessionId}/report`, { replace: true })
    } catch (caught) {
      toast.error(
        caught instanceof ApiError ? caught.detail : 'Не удалось завершить собеседование. Попробуйте ещё раз.',
      )
    } finally {
      setFinishing(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-1.5 w-full rounded-full" />
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 space-y-4 xl:col-span-8">
            <Skeleton className="h-52 w-full rounded-lg" />
            <Skeleton className="h-72 w-full rounded-lg" />
          </div>
          <Skeleton className="col-span-12 h-72 rounded-lg xl:col-span-4" />
        </div>
      </div>
    )
  }

  if (error || !session) {
    return (
      <Card className="border-negative/25 p-4">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-negative" aria-hidden="true" />
            <div>
              <p className="text-14 font-medium text-fg">Не удалось открыть собеседование</p>
              <p className="mt-0.5 text-13 text-fg-2">{error ?? 'Попробуйте вернуться к истории сессий.'}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => navigate('/history')}>
              К истории
            </Button>
            <Button size="sm" onClick={() => void load()} leftIcon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}>
              Повторить
            </Button>
          </div>
        </div>
      </Card>
    )
  }

  if (session.status === 'completed') {
    return <Navigate to={`/interview/${sessionId}/report`} replace />
  }

  const progress = questionsTotal > 0 ? Math.round((answeredCount / questionsTotal) * 100) : 0
  const answeredState = isAnswered && !editing

  return (
    <div className="pb-24 lg:pb-0">
      {/* Шапка сессии */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-20 font-semibold tracking-tight text-fg">Собеседование #{session.id}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Badge tone="accent">{labelOf(ROLE_SHORT_LABELS, session.role)}</Badge>
            <Badge>{labelOf(LEVEL_LABELS, session.level)}</Badge>
            <Badge tone="neutral">{labelOf(MODE_SHORT_LABELS, session.mode)}</Badge>
            <span className="text-13 text-fg-3">
              Вопрос {Math.min(currentIndex + 1, questionsTotal)} из {questionsTotal}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="inline-flex h-10 items-center gap-1.5 rounded-md border border-line bg-surface px-3 text-13 font-medium tabular-nums text-fg">
            <Clock className="h-4 w-4 text-fg-3" aria-hidden="true" />
            {formatClock(elapsed)}
          </span>
          <Button variant="secondary" onClick={() => setFinishOpen(true)}>
            Завершить
          </Button>
        </div>
      </div>

      {/* Прогресс по вопросам */}
      <div className="mb-5">
        <div className="flex items-center justify-between text-12 text-fg-3">
          <span>
            Отвечено {answeredCount} из {questionsTotal}
          </span>
          <span className="tabular-nums">{progress}%</span>
        </div>
        <div className="mt-1.5 flex gap-1" aria-hidden="true">
          {session.questions.map((question, index) => (
            <span
              key={question.id}
              className={cn(
                'h-1 flex-1 rounded-full transition-colors',
                answers[question.id]
                  ? 'bg-positive'
                  : index === currentIndex
                    ? 'bg-accent'
                    : 'bg-line',
              )}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 space-y-4 xl:col-span-8">
          {/* Вопрос */}
          <Card className="p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge tone="accent">Вопрос {currentIndex + 1}</Badge>
              <Badge>{labelOf(QUESTION_TYPE_LABELS, currentQuestion?.type)}</Badge>
              {currentQuestion?.topic ? <Badge>{currentQuestion.topic}</Badge> : null}
              <Badge className={difficultyClasses(currentQuestion?.difficulty)}>
                {labelOf(DIFFICULTY_LABELS, currentQuestion?.difficulty)}
              </Badge>
              {answeredState ? <Badge tone="positive">Отвечено</Badge> : null}
            </div>

            <p className="whitespace-pre-wrap text-16 leading-relaxed text-fg">{currentQuestion?.text}</p>

            {currentQuestion?.starter_code ? (
              <div className="mt-4 overflow-hidden rounded-md border border-line">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-2 px-3 py-1.5">
                  <span className="text-12 text-fg-3">
                    Шаблон кода{currentQuestion.language ? ` · ${currentQuestion.language}` : ''}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => void handleCopyStarter()} leftIcon={<Copy className="h-3.5 w-3.5" aria-hidden="true" />}>
                      {copied ? 'Скопировано' : 'Копировать'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleUseStarter}>
                      Вставить в ответ
                    </Button>
                  </div>
                </div>
                <pre className="overflow-x-auto bg-surface p-3 font-mono text-13 leading-relaxed text-fg">
                  <code>{currentQuestion.starter_code}</code>
                </pre>
              </div>
            ) : null}
          </Card>

          {/* Ответ / оценка */}
          <Card className="p-5">
            <CardHeader
              title={answeredState ? 'Ваш ответ и оценка ИИ' : 'Ваш ответ'}
              description={
                answeredState
                  ? `Время на ответ: ${formatClock(currentAnswer?.answer.time_spent_sec ?? 0)}`
                  : 'Структура: определение → механика → пример → ограничения'
              }
              action={
                answeredState ? (
                  <Button variant="secondary" size="sm" onClick={handleStartEdit} leftIcon={<RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}>
                    Изменить
                  </Button>
                ) : null
              }
            />

            {answeredState && currentAnswer ? (
              <>
                <blockquote className="whitespace-pre-wrap rounded-md border border-line bg-surface-2 p-3.5 text-13 leading-relaxed text-fg-2">
                  {currentAnswer.answer.text}
                </blockquote>
                <div className="mt-4 border-t border-line pt-4">
                  <EvaluationPanel evaluation={currentAnswer.evaluation} />
                </div>
                <div className="mt-4 flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <Button variant="ghost" onClick={() => setFinishOpen(true)}>
                    Завершить собеседование
                  </Button>
                  {hasNext ? (
                    <Button onClick={() => goTo(currentIndex + 1)} rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}>
                      Следующий вопрос
                    </Button>
                  ) : (
                    <Button onClick={() => setFinishOpen(true)} rightIcon={<Check className="h-4 w-4" aria-hidden="true" />}>
                      Завершить и получить отчёт
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <Textarea
                  value={answerText}
                  onChange={(event) => setAnswerText(event.target.value)}
                  onKeyDown={handleTextareaKeyDown}
                  placeholder="Введите развёрнутый ответ. Можно надиктовать голосом — текст появится в поле."
                  className="!min-h-[180px]"
                  aria-label="Текст ответа"
                />

                {speech.interim ? (
                  <p className="rounded-md border border-line bg-surface-2 px-3 py-2 text-12 text-fg-2">
                    Распознаётся: {speech.interim}
                  </p>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant={speech.listening ? 'danger' : 'secondary'}
                      size="sm"
                      onClick={speech.toggle}
                      disabled={!speech.supported}
                      leftIcon={speech.listening ? <MicOff className="h-4 w-4" aria-hidden="true" /> : <Mic className="h-4 w-4" aria-hidden="true" />}
                    >
                      {speech.listening ? 'Остановить запись' : 'Надиктовать'}
                    </Button>
                    <span className="text-12 text-fg-3">
                      {speech.supported
                        ? 'Русский язык, Web Speech API'
                        : 'Браузер не поддерживает распознавание речи — введите ответ текстом'}
                    </span>
                  </div>
                  <span className="text-12 tabular-nums text-fg-3">{answerText.trim().length} символов</span>
                </div>

                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-12 text-fg-3">Ctrl+Enter — отправить ответ</p>
                  <Button onClick={() => void handleSubmitAnswer()} loading={submitting} rightIcon={<Check className="h-4 w-4" aria-hidden="true" />}>
                    {isAnswered ? 'Сохранить и переоценить' : 'Ответить'}
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Навигатор и подсказки */}
        <aside className="col-span-12 space-y-4 xl:col-span-4">
          <Card className="p-4 xl:sticky xl:top-[72px]">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-14 font-semibold text-fg">Вопросы</h2>
              <span className="text-12 tabular-nums text-fg-3">
                {answeredCount}/{questionsTotal}
              </span>
            </div>
            <ol className="mt-3 space-y-1">
              {session.questions.map((question, index) => {
                const answered = Boolean(answers[question.id])
                const active = index === currentIndex
                return (
                  <li key={question.id}>
                    <button
                      type="button"
                      onClick={() => goTo(index)}
                      aria-current={active ? 'step' : undefined}
                      className={cn(
                        'flex min-h-10 w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors',
                        active ? 'bg-accent-soft' : 'hover:bg-surface-2',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-12 font-medium',
                          answered
                            ? 'border-positive/30 bg-positive-soft text-positive'
                            : active
                              ? 'border-accent/30 bg-accent-soft text-accent'
                              : 'border-line bg-surface-2 text-fg-3',
                        )}
                      >
                        {answered ? <Check className="h-3 w-3" aria-hidden="true" /> : index + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-13 text-fg">{question.topic}</span>
                        <span className="block text-12 text-fg-3">{labelOf(QUESTION_TYPE_LABELS, question.type)}</span>
                      </span>
                      {answered ? (
                        <span className="shrink-0 text-12 font-medium tabular-nums text-fg-2">
                          {formatScore(answers[question.id]?.evaluation.score)}
                        </span>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ol>

            <Button
              variant="secondary"
              fullWidth
              className="mt-3"
              loading={addingQuestion}
              onClick={() => void handleAddAdaptiveQuestion()}
              leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
            >
              Добавить вопрос
            </Button>
            <p className="mt-1.5 text-12 leading-relaxed text-fg-3">
              Адаптивный вопрос учитывает ваши слабые темы и не входит в исходный план.
            </p>
          </Card>

          <Card className="p-4">
            <p className="flex items-center gap-1.5 text-12 font-semibold uppercase tracking-wide text-fg-2">
              <Lightbulb className="h-3.5 w-3.5 text-caution" aria-hidden="true" />
              Как отвечать
            </p>
            <ul className="mt-2 space-y-2 text-13 leading-relaxed text-fg-2">
              <li>Начните с короткого определения — это база оценки.</li>
              <li>Добавьте механику «как это работает» и пример из практики.</li>
              <li>Упомяните ограничения и типичные ошибки — это глубина.</li>
              <li>Держите структуру: тезис → пояснение → вывод.</li>
            </ul>
          </Card>
        </aside>
      </div>

      {/* Sticky-действие на мобильном */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface p-3 lg:hidden">
        <div className="mx-auto flex max-w-container items-center gap-2">
          <Button
            fullWidth
            size="lg"
            loading={answeredState ? false : submitting}
            disabled={answeredState ? false : !answerText.trim()}
            onClick={() => {
              if (answeredState) {
                if (hasNext) goTo(currentIndex + 1)
                else setFinishOpen(true)
              } else {
                void handleSubmitAnswer()
              }
            }}
          >
            {answeredState
              ? hasNext
                ? 'Следующий вопрос'
                : 'Завершить и получить отчёт'
              : isAnswered
                ? 'Сохранить и переоценить'
                : 'Ответить'}
          </Button>
        </div>
      </div>

      <Modal
        open={finishOpen}
        onClose={() => setFinishOpen(false)}
        title="Завершить собеседование?"
        description="ИИ посчитает итоговый отчёт по уже отправленным ответам."
        footer={
          <>
            <Button variant="secondary" onClick={() => setFinishOpen(false)}>
              Продолжить
            </Button>
            <Button
              onClick={() => void handleFinish()}
              loading={finishing}
              disabled={answeredCount === 0}
              leftIcon={<Check className="h-4 w-4" aria-hidden="true" />}
            >
              Завершить
            </Button>
          </>
        }
      >
        {answeredCount === 0 ? (
          <div className="flex items-start gap-2 rounded-md border border-caution/25 bg-caution-soft px-3 py-2.5 text-13 text-caution">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Чтобы сформировать отчёт, ответьте хотя бы на один вопрос.</span>
          </div>
        ) : (
          <div className="space-y-2 text-13 text-fg-2">
            <p>
              Отвечено <span className="font-semibold text-fg">{answeredCount}</span> из{' '}
              <span className="font-semibold text-fg">{questionsTotal}</span> вопросов.
            </p>
            {answeredCount < questionsTotal ? (
              <p className="text-12 leading-relaxed text-fg-3">
                Оставшиеся {questionsTotal - answeredCount} вопрос(ов) не попадут в отчёт. После завершения
                вернуться к ним будет нельзя.
              </p>
            ) : (
              <p className="text-12 text-positive">Все вопросы отвечены.</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

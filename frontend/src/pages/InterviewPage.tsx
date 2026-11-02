import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Lightbulb,
  ListChecks,
  Mic,
  MicOff,
  RefreshCw,
  Sparkles,
  StopCircle,
} from 'lucide-react'
import { useCallback, useEffect, useState, type KeyboardEvent } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'

import { EvaluationPanel } from '@/components/EvaluationPanel'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { Skeleton } from '@/components/ui/Skeleton'
import { Textarea } from '@/components/ui/Field'
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
  const isLast = questionsTotal > 0 && currentIndex === questionsTotal - 1

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
      toast.success('Добавлен дополнительный вопрос — он учитывает слабые темы')
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
      <div>
        <div className="mb-5 flex items-center justify-between gap-3">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-32" />
        </div>
        <Skeleton className="mb-5 h-2 w-full rounded-full" />
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <Skeleton className="h-56 w-full rounded-2xl" />
            <Skeleton className="h-64 w-full rounded-2xl" />
          </div>
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
      </div>
    )
  }

  if (error || !session) {
    return (
      <Card className="border-rose-500/25 bg-rose-500/[0.04]">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-rose-100">Не удалось открыть собеседование</p>
              <p className="mt-0.5 text-xs text-rose-200/70">{error ?? 'Попробуйте вернуться к списку сессий.'}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => navigate('/history')}>
              К истории
            </Button>
            <Button size="sm" onClick={() => void load()} leftIcon={<RefreshCw className="h-4 w-4" />}>
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

  return (
    <div>
      {/* Верхняя панель */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate('/history')} leftIcon={<ArrowLeft className="h-4 w-4" />}>
            История
          </Button>
          <Badge tone="accent">{labelOf(ROLE_SHORT_LABELS, session.role)}</Badge>
          <Badge>{labelOf(LEVEL_LABELS, session.level)}</Badge>
          <Badge tone="violet">{labelOf(MODE_SHORT_LABELS, session.mode)}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium tabular-nums text-slate-200">
            <Clock className="h-4 w-4 text-slate-500" aria-hidden="true" />
            {formatClock(elapsed)}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setFinishOpen(true)}
            leftIcon={<StopCircle className="h-4 w-4" />}
          >
            Завершить
          </Button>
        </div>
      </div>

      <div className="mb-5 space-y-1.5">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            Вопрос {Math.min(currentIndex + 1, questionsTotal)} из {questionsTotal}
          </span>
          <span>
            Отвечено {answeredCount} из {questionsTotal}
          </span>
        </div>
        <ProgressBar value={progress} tone={progress >= 100 ? 'emerald' : 'accent'} size="sm" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Карточка вопроса */}
          <Card>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge tone="accent">Вопрос {currentIndex + 1}</Badge>
              <Badge tone="info">{labelOf(QUESTION_TYPE_LABELS, currentQuestion?.type)}</Badge>
              {currentQuestion?.topic ? <Badge>{currentQuestion.topic}</Badge> : null}
              <Badge className={difficultyClasses(currentQuestion?.difficulty)}>
                {labelOf(DIFFICULTY_LABELS, currentQuestion?.difficulty)}
              </Badge>
              {isAnswered && !editing ? <Badge tone="success">Отвечено</Badge> : null}
            </div>
            <p className="whitespace-pre-wrap text-base leading-relaxed text-slate-100 sm:text-lg">
              {currentQuestion?.text}
            </p>

            {currentQuestion?.starter_code ? (
              <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-ink-950/70">
                <div className="flex items-center justify-between border-b border-white/5 px-3 py-1.5">
                  <span className="text-[11px] uppercase tracking-wider text-slate-500">
                    Шаблон кода{currentQuestion.language ? ` · ${currentQuestion.language}` : ''}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => void handleCopyStarter()} leftIcon={<Copy className="h-3.5 w-3.5" />}>
                      {copied ? 'Скопировано' : 'Копировать'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleUseStarter}>
                      Вставить в ответ
                    </Button>
                  </div>
                </div>
                <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed text-slate-200">
                  <code>{currentQuestion.starter_code}</code>
                </pre>
              </div>
            ) : null}
          </Card>

          {/* Ответ или оценка */}
          <Card>
            <CardHeader
              title={isAnswered && !editing ? 'Ваш ответ и оценка ИИ' : 'Ваш ответ'}
              description={
                isAnswered && !editing
                  ? `Время на ответ: ${formatClock(currentAnswer?.answer.time_spent_sec ?? 0)}`
                  : 'Отвечайте структурированно: определение → механика → пример → ограничения'
              }
              icon={<ListChecks className="h-4 w-4" />}
              action={
                isAnswered && !editing ? (
                  <Button variant="secondary" size="sm" onClick={handleStartEdit} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>
                    Изменить ответ
                  </Button>
                ) : null
              }
            />

            {isAnswered && !editing && currentAnswer ? (
              <>
                <blockquote className="whitespace-pre-wrap rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-relaxed text-slate-300">
                  {currentAnswer.answer.text}
                </blockquote>
                <div className="mt-5 border-t border-white/5 pt-5">
                  <EvaluationPanel evaluation={currentAnswer.evaluation} />
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <Textarea
                  value={answerText}
                  onChange={(event) => setAnswerText(event.target.value)}
                  onKeyDown={handleTextareaKeyDown}
                  placeholder="Введите развёрнутый ответ. Можно надиктовать голосом — текст появится в поле."
                  className="!min-h-44"
                  aria-label="Текст ответа"
                />

                {speech.interim ? (
                  <p className="rounded-lg border border-accent-400/20 bg-accent-500/[0.06] px-3 py-2 text-xs italic text-accent-200">
                    Распознаётся: {speech.interim}
                  </p>
                ) : null}

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant={speech.listening ? 'danger' : 'secondary'}
                      size="sm"
                      onClick={speech.toggle}
                      disabled={!speech.supported}
                      leftIcon={
                        speech.listening ? (
                          <span className="relative flex h-4 w-4 items-center justify-center">
                            <span className="absolute inline-flex h-3 w-3 animate-ping rounded-full bg-rose-400 opacity-70" />
                            <MicOff className="relative h-4 w-4" />
                          </span>
                        ) : (
                          <Mic className="h-4 w-4" />
                        )
                      }
                    >
                      {speech.listening ? 'Остановить запись' : 'Надиктовать'}
                    </Button>
                    <span className="text-xs text-slate-600">
                      {speech.supported
                        ? 'Web Speech API · русский язык'
                        : 'Браузер не поддерживает распознавание речи — введите ответ текстом'}
                    </span>
                  </div>
                  <span className="text-xs tabular-nums text-slate-600">{answerText.trim().length} симв.</span>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-slate-600">Ctrl+Enter — отправить ответ</p>
                  <Button onClick={() => void handleSubmitAnswer()} loading={submitting} rightIcon={<Check className="h-4 w-4" />}>
                    {isAnswered ? 'Сохранить и переоценить' : 'Ответить'}
                  </Button>
                </div>
              </div>
            )}

            {isAnswered && !editing ? (
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <Button variant="ghost" onClick={() => setFinishOpen(true)}>
                  Завершить собеседование
                </Button>
                {hasNext ? (
                  <Button onClick={() => goTo(currentIndex + 1)} rightIcon={<ArrowRight className="h-4 w-4" />}>
                    Следующий вопрос
                  </Button>
                ) : (
                  <Button onClick={() => setFinishOpen(true)} rightIcon={<Check className="h-4 w-4" />}>
                    Завершить и получить отчёт
                  </Button>
                )}
              </div>
            ) : isLast ? (
              <p className="mt-3 text-xs text-slate-600">
                Это последний вопрос. После ответа можно завершить собеседование или добавить дополнительный вопрос.
              </p>
            ) : null}
          </Card>
        </div>

        {/* Навигатор по вопросам */}
        <aside className="space-y-5">
          <Card className="lg:sticky lg:top-6">
            <CardHeader
              title="Вопросы"
              description={`Отвечено ${answeredCount} из ${questionsTotal}`}
              icon={<ListChecks className="h-4 w-4" />}
            />
            <div className="space-y-1.5">
              {session.questions.map((question, index) => {
                const answered = Boolean(answers[question.id])
                const active = index === currentIndex
                return (
                  <button
                    key={question.id}
                    type="button"
                    onClick={() => goTo(index)}
                    aria-current={active ? 'step' : undefined}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition',
                      active
                        ? 'border-accent-400/50 bg-accent-500/10'
                        : 'border-transparent bg-white/[0.02] hover:bg-white/[0.05]',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold',
                        answered
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : active
                            ? 'bg-accent-500/20 text-accent-200'
                            : 'bg-white/5 text-slate-500',
                      )}
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs text-slate-300">{question.topic}</span>
                      <span className="block text-[10px] uppercase tracking-wider text-slate-600">
                        {labelOf(QUESTION_TYPE_LABELS, question.type)}
                      </span>
                    </span>
                    {answered ? (
                      <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-emerald-300">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        {formatScore(answers[question.id]?.evaluation.score)}
                      </span>
                    ) : (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-600" aria-hidden="true" />
                    )}
                  </button>
                )
              })}
            </div>

            <Button
              variant="soft"
              fullWidth
              className="mt-4"
              loading={addingQuestion}
              onClick={() => void handleAddAdaptiveQuestion()}
              leftIcon={<Sparkles className="h-4 w-4" />}
            >
              Доп. вопрос ИИ
            </Button>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
              Адаптивный вопрос строится по вашим слабым местам и не входит в исходный план.
            </p>
          </Card>

          <Card>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <Lightbulb className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
              Как отвечать
            </p>
            <ul className="space-y-2 text-xs leading-relaxed text-slate-500">
              <li>Начните с короткого определения — это база оценки.</li>
              <li>Добавьте механику «как это работает» и пример из практики.</li>
              <li>Упомяните ограничения и типичные ошибки — это глубина.</li>
              <li>Следите за структурой: тезис → пояснение → вывод.</li>
            </ul>
          </Card>
        </aside>
      </div>

      {/* Завершение */}
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
              leftIcon={<Check className="h-4 w-4" />}
            >
              Завершить
            </Button>
          </>
        }
      >
        {answeredCount === 0 ? (
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3.5 py-3 text-sm text-amber-100">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Чтобы сформировать отчёт, ответьте хотя бы на один вопрос.</span>
          </div>
        ) : (
          <div className="space-y-2 text-sm text-slate-300">
            <p>
              Отвечено <span className="font-semibold text-slate-100">{answeredCount}</span> из{' '}
              <span className="font-semibold text-slate-100">{questionsTotal}</span> вопросов.
            </p>
            {answeredCount < questionsTotal ? (
              <p className="text-xs text-slate-500">
                Оставшиеся {questionsTotal - answeredCount} вопрос(ов) не попадут в отчёт. Вернуться к ним после
                завершения будет нельзя.
              </p>
            ) : (
              <p className="text-xs text-emerald-300">Все вопросы отвечены — отличная работа!</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Lightbulb,
  MessageSquare,
  Plus,
  Target,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { ProgressBar, toneByScore } from '@/components/ui/ProgressBar'
import { ScoreRing } from '@/components/ui/ScoreRing'
import { Skeleton } from '@/components/ui/Skeleton'
import { ApiError, api } from '@/lib/api'
import { formatDate, formatDateTime, formatDuration, formatScore, plural } from '@/lib/format'
import { LEVEL_LABELS, MODE_LABELS, ROLE_LABELS, labelOf } from '@/lib/labels'
import type { SessionDetail } from '@/lib/types'

export function ReportPage() {
  const { id } = useParams<{ id: string }>()
  const sessionId = Number(id)
  const navigate = useNavigate()

  const [session, setSession] = useState<SessionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!Number.isFinite(sessionId) || sessionId <= 0) {
      setError('Некорректный идентификатор собеседования.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      setSession(await api.interviews.get(sessionId))
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status === 404
          ? 'Собеседование не найдено или принадлежит другому пользователю.'
          : caught instanceof Error && caught.message
            ? caught.message
            : 'Не удалось загрузить отчёт.',
      )
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-44 w-full rounded-lg" />
        <div className="grid grid-cols-12 gap-4">
          <Skeleton className="col-span-12 h-52 rounded-lg lg:col-span-6" />
          <Skeleton className="col-span-12 h-52 rounded-lg lg:col-span-6" />
        </div>
      </div>
    )
  }

  if (error || !session) {
    return (
      <div>
        <PageHeader title="Отчёт по собеседованию" />
        <Card className="border-negative/25 p-4">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-negative" aria-hidden="true" />
              <p className="text-13 text-fg-2">{error ?? 'Отчёт недоступен.'}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => navigate('/history')}>
                К истории
              </Button>
              <Button size="sm" onClick={() => void load()}>
                Повторить
              </Button>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  if (session.status === 'in_progress') {
    return (
      <div>
        <PageHeader
          title={`Отчёт по сессии #${session.id}`}
          description="Собеседование ещё не завершено — отчёт формируется по отправленным ответам."
        />
        <Card>
          <EmptyState
            icon={Clock}
            title="Сначала завершите сессию"
            description="Ответьте на вопросы и завершите собеседование: появятся итоговый балл, вердикт, темы и рекомендации."
            action={
              <Button
                onClick={() => navigate(`/interview/${session.id}`)}
                rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
              >
                Продолжить собеседование
              </Button>
            }
          />
        </Card>
      </div>
    )
  }

  const report = session.report
  const overallScore = report?.overall_score ?? session.overall_score ?? 0
  const topicScores = Object.entries(report?.topic_scores ?? {}).sort((first, second) => first[1] - second[1])
  const answeredCount = report?.answered_count ?? session.answered_count
  const duration = report?.duration_sec ?? session.duration_sec

  return (
    <div>
      <PageHeader
        title={`Отчёт по сессии #${session.id}`}
        description={`${labelOf(ROLE_LABELS, session.role)} · ${labelOf(LEVEL_LABELS, session.level)} · ${formatDateTime(session.finished_at ?? session.started_at)}`}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => navigate('/history')}
              leftIcon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />}
            >
              История
            </Button>
            <Button onClick={() => navigate('/interview/new')} leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}>
              Новая сессия
            </Button>
          </>
        }
      />

      {/* Итоги */}
      <Card className="p-5">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="flex shrink-0 justify-center lg:justify-start">
            <ScoreRing score={overallScore} size={132} strokeWidth={9} label="итоговый балл" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge tone="accent">{labelOf(ROLE_LABELS, session.role)}</Badge>
              <Badge>{labelOf(LEVEL_LABELS, session.level)}</Badge>
              <Badge tone="neutral">{labelOf(MODE_LABELS, session.mode)}</Badge>
              <Badge tone="positive">Завершена</Badge>
            </div>

            <p className="text-12 font-semibold uppercase tracking-wide text-fg-3">Вердикт ИИ</p>
            <p className="mt-1 text-14 leading-relaxed text-fg">
              {report?.verdict?.trim() ||
                'Отчёт сформирован по отправленным ответам. Ниже — сильные стороны, пробелы и рекомендации.'}
            </p>

            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-md border border-line px-3 py-2">
                <dt className="text-12 text-fg-3">Отвечено</dt>
                <dd className="mt-0.5 text-14 font-medium text-fg">
                  {answeredCount} из {session.question_count}
                </dd>
              </div>
              <div className="rounded-md border border-line px-3 py-2">
                <dt className="text-12 text-fg-3">Длительность</dt>
                <dd className="mt-0.5 text-14 font-medium text-fg">{formatDuration(duration)}</dd>
              </div>
              <div className="rounded-md border border-line px-3 py-2">
                <dt className="text-12 text-fg-3">Вопросов</dt>
                <dd className="mt-0.5 text-14 font-medium text-fg">{session.questions.length}</dd>
              </div>
              <div className="rounded-md border border-line px-3 py-2">
                <dt className="text-12 text-fg-3">Дата</dt>
                <dd className="mt-0.5 text-14 font-medium text-fg">
                  {session.finished_at ? formatDate(session.finished_at) : '—'}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-12 gap-4">
        {/* Баллы по темам */}
        <Card className="col-span-12 p-5 lg:col-span-6">
          <CardHeader title="Баллы по темам" description="Средняя оценка ответов по каждой теме" />
          {topicScores.length === 0 ? (
            <EmptyState compact icon={Target} title="Нет данных по темам" description="Ответьте на вопросы разных тем." />
          ) : (
            <ul className="space-y-3.5">
              {topicScores.map(([topic, score]) => (
                <li key={topic}>
                  <ProgressBar
                    label={topic}
                    valueLabel={formatScore(score)}
                    value={(score / 10) * 100}
                    tone={toneByScore(score)}
                    size="sm"
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Рекомендации */}
        <Card className="col-span-12 p-5 lg:col-span-6">
          <CardHeader title="Рекомендации" description="Что подтянуть перед следующей сессией" />
          {report?.recommendations?.length ? (
            <ol className="space-y-2.5">
              {report.recommendations.map((item, index) => (
                <li
                  key={index}
                  className="flex gap-2.5 rounded-md border border-line p-3 text-13 leading-relaxed text-fg-2"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-12 font-medium text-fg-2">
                    {index + 1}
                  </span>
                  {item}
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState
              compact
              icon={Lightbulb}
              title="Рекомендаций пока нет"
              description="ИИ сформирует их, когда наберётся достаточно ответов."
            />
          )}
        </Card>

        {/* Сильные стороны */}
        <Card className="col-span-12 p-5 lg:col-span-6">
          <CardHeader title="Сильные стороны" />
          {report?.strengths?.length ? (
            <ul className="space-y-2.5">
              {report.strengths.map((item, index) => (
                <li key={index} className="flex gap-2 text-13 leading-relaxed text-fg-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-positive" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              compact
              icon={CheckCircle2}
              title="Пока не выделены"
              description="Ответьте развёрнуто — ИИ отметит сильные места."
            />
          )}
        </Card>

        {/* Пробелы */}
        <Card className="col-span-12 p-5 lg:col-span-6">
          <CardHeader title="Пробелы в знаниях" />
          {report?.gaps?.length ? (
            <ul className="space-y-2.5">
              {report.gaps.map((item, index) => (
                <li key={index} className="flex gap-2 text-13 leading-relaxed text-fg-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-caution" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              compact
              icon={AlertTriangle}
              title="Пробелов не найдено"
              description="Хороший знак — продолжайте практику."
            />
          )}
        </Card>
      </div>

      <Card className="mt-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-13 font-medium text-fg">Закрепите результат</p>
            <p className="mt-0.5 text-12 text-fg-2">
              {report?.gaps?.length
                ? 'Начните новую сессию с фокусом на пробелы или обсудите тему в чате.'
                : `Итоговый балл — ${formatScore(overallScore)} из 10 за ${session.question_count} ${plural(session.question_count, ['вопрос', 'вопроса', 'вопросов'])}.`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => navigate('/chat')}
              leftIcon={<MessageSquare className="h-4 w-4" aria-hidden="true" />}
            >
              Чат по теории
            </Button>
            <Button onClick={() => navigate('/interview/new')} leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}>
              Пройти ещё раз
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

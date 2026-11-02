import {
  ArrowLeft,
  ArrowRight,
  Award,
  Calendar,
  CheckCircle2,
  Clock,
  Layers,
  Lightbulb,
  Sparkles,
  Target,
  TrendingDown,
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
import { formatDateTime, formatDuration, formatScore, questionsLabel } from '@/lib/format'
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
      <div>
        <Skeleton className="mb-6 h-10 w-72" />
        <Skeleton className="mb-5 h-64 w-full rounded-2xl" />
        <div className="grid gap-5 lg:grid-cols-3">
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      </div>
    )
  }

  if (error || !session) {
    return (
      <div>
        <PageHeader title="Отчёт по собеседованию" />
        <Card className="border-rose-500/25 bg-rose-500/[0.04]">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-rose-100">{error ?? 'Отчёт недоступен.'}</p>
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
        <PageHeader eyebrow="Отчёт" title="Собеседование ещё не завершено" />
        <Card>
          <EmptyState
            icon={Clock}
            title="Сначала ответьте на вопросы и завершите сессию"
            description="Отчёт формируется по отправленным ответам: итоговый балл, вердикт, темы и рекомендации."
            action={
              <Button onClick={() => navigate(`/interview/${sessionId}`)} rightIcon={<ArrowRight className="h-4 w-4" />}>
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
  const topicScores = Object.entries(report?.topic_scores ?? {}).sort((a, b) => a[1] - b[1])
  const answeredCount = report?.answered_count ?? session.answered_count
  const duration = report?.duration_sec ?? session.duration_sec

  return (
    <div>
      <PageHeader
        eyebrow="Отчёт по собеседованию"
        title="Итоги и рекомендации"
        description={`${labelOf(ROLE_LABELS, session.role)} · ${formatDateTime(session.finished_at ?? session.started_at)}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/history')} leftIcon={<ArrowLeft className="h-4 w-4" />}>
              История
            </Button>
            <Button onClick={() => navigate('/interview/new')} leftIcon={<Sparkles className="h-4 w-4" />}>
              Новое собеседование
            </Button>
          </>
        }
      />

      {/* Итоговый балл и вердикт */}
      <Card className="mb-5">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="flex shrink-0 justify-center sm:justify-start">
            <ScoreRing score={overallScore} size={148} strokeWidth={11} label="итоговый балл" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge tone="accent">{labelOf(ROLE_LABELS, session.role)}</Badge>
              <Badge>{labelOf(LEVEL_LABELS, session.level)}</Badge>
              <Badge tone="violet">{labelOf(MODE_LABELS, session.mode)}</Badge>
              <Badge tone="success">Завершена</Badge>
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Вердикт ИИ</p>
            <p className="mt-1 text-base leading-relaxed text-slate-200 sm:text-lg">
              {report?.verdict?.trim() ||
                'Отчёт сформирован по отправленным ответам. Ниже — сильные стороны, пробелы и рекомендации.'}
            </p>

            <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                <dt className="text-[10px] uppercase tracking-wider text-slate-500">Отвечено</dt>
                <dd className="mt-0.5 text-sm font-semibold text-slate-100">
                  {answeredCount} из {session.question_count}
                </dd>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                <dt className="text-[10px] uppercase tracking-wider text-slate-500">Длительность</dt>
                <dd className="mt-0.5 text-sm font-semibold text-slate-100">{formatDuration(duration)}</dd>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                <dt className="text-[10px] uppercase tracking-wider text-slate-500">Вопросов</dt>
                <dd className="mt-0.5 text-sm font-semibold text-slate-100">{session.questions.length}</dd>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                <dt className="text-[10px] uppercase tracking-wider text-slate-500">Дата</dt>
                <dd className="mt-0.5 flex items-center gap-1 text-sm font-semibold text-slate-100">
                  <Calendar className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                  {session.finished_at ? formatDateTime(session.finished_at).split(',')[0] : '—'}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Баллы по темам */}
        <Card>
          <CardHeader title="Баллы по темам" description="Средняя оценка ответов" icon={<Target className="h-4 w-4" />} />
          {topicScores.length === 0 ? (
            <EmptyState compact icon={Target} title="Нет данных по темам" description="Ответьте на вопросы разных тем." />
          ) : (
            <div className="space-y-3.5">
              {topicScores.map(([topic, score]) => (
                <ProgressBar
                  key={topic}
                  label={topic}
                  valueLabel={formatScore(score)}
                  value={(score / 10) * 100}
                  tone={toneByScore(score)}
                  size="sm"
                />
              ))}
            </div>
          )}
        </Card>

        {/* Сильные стороны */}
        <Card>
          <CardHeader title="Сильные стороны" icon={<Award className="h-4 w-4" />} />
          {report?.strengths?.length ? (
            <ul className="space-y-2.5">
              {report.strengths.map((item, index) => (
                <li key={index} className="flex gap-2 text-sm leading-relaxed text-slate-300">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact icon={Award} title="Пока не выделены" description="Ответьте развёрнуто — ИИ отметит сильные места." />
          )}
        </Card>

        {/* Пробелы */}
        <Card>
          <CardHeader title="Пробелы в знаниях" icon={<TrendingDown className="h-4 w-4" />} />
          {report?.gaps?.length ? (
            <ul className="space-y-2.5">
              {report.gaps.map((item, index) => (
                <li key={index} className="flex gap-2 text-sm leading-relaxed text-slate-300">
                  <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact icon={TrendingDown} title="Пробелов не найдено" description="Хороший знак — продолжайте практику." />
          )}
        </Card>
      </div>

      {/* Рекомендации */}
      <Card className="mt-5">
        <CardHeader
          title="Рекомендации к следующему шагу"
          description="Что подтянуть перед следующим собеседованием"
          icon={<Lightbulb className="h-4 w-4" />}
        />
        {report?.recommendations?.length ? (
          <ol className="grid gap-2.5 sm:grid-cols-2">
            {report.recommendations.map((item, index) => (
              <li
                key={index}
                className="flex gap-2.5 rounded-xl border border-white/10 bg-white/[0.02] p-3.5 text-sm leading-relaxed text-slate-300"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-accent-400/30 bg-accent-500/10 text-[11px] font-semibold text-accent-200">
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

      {/* CTA */}
      <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-200">Закрепите результат на практике</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Пройдите ещё одну сессию{report?.gaps?.length ? ' с фокусом на пробелы' : ''} или обсудите сложную тему в чате.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => navigate('/chat')} leftIcon={<Layers className="h-4 w-4" />}>
            Чат по теории
          </Button>
          <Button onClick={() => navigate('/interview/new')} leftIcon={<Sparkles className="h-4 w-4" />}>
            Пройти ещё раз
          </Button>
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-slate-600">
        Итоговый балл — {formatScore(overallScore)} из 10 · {questionsLabel(session.question_count)}
      </p>
    </div>
  )
}

import {
  AlertCircle,
  ArrowRight,
  Flame,
  Layers,
  ListChecks,
  RefreshCw,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { PageHeader } from '@/components/PageHeader'
import { SessionCard } from '@/components/SessionCard'
import { StatCard } from '@/components/StatCard'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { ProgressBar, toneByScore } from '@/components/ui/ProgressBar'
import { Skeleton, SkeletonStatCard, SkeletonText } from '@/components/ui/Skeleton'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/lib/api'
import { formatNumber, formatScore, questionsLabel } from '@/lib/format'
import { DIFFICULTY_LABELS, labelOf } from '@/lib/labels'
import type { AnalyticsOut } from '@/lib/types'

/** Короткая подпись даты для оси графика: 2026-10-30 → 30.10. */
function shortDate(value: string): string {
  return value.length >= 10 ? `${value.slice(8, 10)}.${value.slice(5, 7)}` : value
}

export function DashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [data, setData] = useState<AnalyticsOut | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await api.analytics())
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : 'Не удалось загрузить статистику. Проверьте соединение с сервером.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const firstName = user?.full_name?.trim().split(/\s+/)[0] || 'друг'
  const chartData = (data?.score_history ?? []).map((point) => ({ date: point.date, score: point.score }))
  const weakTopics = (data?.weak_topics ?? []).slice(0, 5)
  const strongTopics = (data?.strong_topics ?? []).slice(0, 5)
  const difficultyEntries = Object.entries(data?.difficulty_stats ?? {})
  const inProgress = (data?.recent_sessions ?? []).find((session) => session.status === 'in_progress')
  const recentSessions = (data?.recent_sessions ?? []).slice(0, 4)

  return (
    <div>
      <PageHeader
        eyebrow="Дашборд"
        title={`Привет, ${firstName}!`}
        description="Следите за прогрессом, разбирайте слабые темы и тренируйтесь на ИИ-собеседованиях."
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/history')} leftIcon={<Layers className="h-4 w-4" />}>
              История
            </Button>
            <Button onClick={() => navigate('/interview/new')} leftIcon={<Sparkles className="h-4 w-4" />}>
              Начать собеседование
            </Button>
          </>
        }
      />

      {inProgress ? (
        <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-sky-500/25 bg-sky-500/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-sky-100">У вас есть незавершённое собеседование</p>
            <p className="mt-0.5 text-xs text-sky-200/60">
              {questionsLabel(inProgress.question_count)} · отвечено {inProgress.answered_count}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => navigate(`/interview/${inProgress.id}`)}>
            Продолжить
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      ) : null}

      {error ? (
        <Card className="border-rose-500/25 bg-rose-500/[0.04]">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-rose-100">Не удалось загрузить дашборд</p>
                <p className="mt-0.5 text-xs text-rose-200/70">{error}</p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => void load()} leftIcon={<RefreshCw className="h-4 w-4" />}>
              Повторить
            </Button>
          </div>
        </Card>
      ) : null}

      {/* Метрики */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {loading || !data ? (
          <>
            <SkeletonStatCard />
            <SkeletonStatCard />
            <SkeletonStatCard />
            <SkeletonStatCard />
          </>
        ) : (
          <>
            <StatCard
              label="Сессий пройдено"
              value={formatNumber(data.sessions_count)}
              hint={`завершено ${formatNumber(data.completed_sessions)}`}
              icon={Layers}
              tone="accent"
            />
            <StatCard
              label="Средний балл"
              value={formatScore(data.avg_score)}
              hint={`лучший результат ${formatScore(data.best_score)}`}
              icon={Target}
              tone="emerald"
            />
            <StatCard
              label="Вопросов отвечено"
              value={formatNumber(data.questions_answered)}
              hint="по всем сессиям"
              icon={ListChecks}
              tone="sky"
            />
            <StatCard
              label="Серия занятий"
              value={data.streak_days}
              hint={`${data.streak_days} дн. подряд`}
              icon={Flame}
              tone="amber"
            />
          </>
        )}
      </div>

      {/* График и слабые темы */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Динамика баллов"
            description="Средний балл по завершённым сессиям"
            icon={<TrendingUp className="h-4 w-4" />}
            action={<span className="text-xs text-slate-500">0–10</span>}
          />
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : chartData.length === 0 ? (
            <EmptyState
              compact
              icon={TrendingUp}
              title="Пока нет данных для графика"
              description="Пройдите первое собеседование — динамика баллов появится здесь."
              action={<Button size="sm" onClick={() => navigate('/interview/new')}>Начать собеседование</Button>}
            />
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                  <defs>
                    <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#818cf8" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#818cf8" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={shortDate}
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={16}
                  />
                  <YAxis
                    domain={[0, 10]}
                    ticks={[0, 2, 4, 6, 8, 10]}
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={36}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#0c1220',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: '#94a3b8' }}
                    itemStyle={{ color: '#e2e8f0' }}
                    labelFormatter={(label) => (typeof label === 'string' ? shortDate(label) : label)}
                    formatter={(value) => [`${formatScore(Number(value))} / 10`, 'Балл']}
                  />
                  <Area
                    type="monotone"
                    dataKey="score"
                    stroke="#818cf8"
                    strokeWidth={2}
                    fill="url(#scoreGradient)"
                    activeDot={{ r: 4, fill: '#c7d2fe', stroke: '#4f46e5', strokeWidth: 2 }}
                    dot={{ r: 2.5, fill: '#818cf8', strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Слабые темы"
            description="Темы, где стоит подтянуть знания"
            icon={<TrendingDown className="h-4 w-4" />}
          />
          {loading ? (
            <SkeletonText lines={5} />
          ) : weakTopics.length === 0 ? (
            <EmptyState
              compact
              icon={TrendingDown}
              title="Слабых тем пока нет"
              description="Появятся после нескольких ответов — ИИ сравнит результаты по темам."
            />
          ) : (
            <div className="space-y-3.5">
              {weakTopics.map((topic) => (
                <ProgressBar
                  key={topic.topic}
                  label={topic.topic}
                  valueLabel={`${formatScore(topic.avg_score)} · ${questionsLabel(topic.answers_count)}`}
                  value={(topic.avg_score / 10) * 100}
                  tone={toneByScore(topic.avg_score)}
                  size="sm"
                />
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Последние сессии и сильные темы */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader
              title="Последние сессии"
              description="Ваши недавние собеседования"
              icon={<Layers className="h-4 w-4" />}
              action={
                <Button variant="ghost" size="sm" onClick={() => navigate('/history')}>
                  Все сессии
                  <ArrowRight className="h-4 w-4" />
                </Button>
              }
            />
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
              </div>
            ) : recentSessions.length === 0 ? (
              <EmptyState
                compact
                icon={Sparkles}
                title="Собеседований ещё не было"
                description="Создайте первую сессию: ИИ задаст вопросы по вашему направлению и уровню."
                action={<Button size="sm" onClick={() => navigate('/interview/new')}>Начать собеседование</Button>}
              />
            ) : (
              <div className="space-y-3">
                {recentSessions.map((session) => (
                  <SessionCard key={session.id} session={session} />
                ))}
              </div>
            )}
          </Card>
        </div>

        <Card>
          <CardHeader
            title="Сильные темы"
            description="Получается лучше всего"
            icon={<TrendingUp className="h-4 w-4" />}
          />
          {loading ? (
            <SkeletonText lines={5} />
          ) : strongTopics.length === 0 ? (
            <EmptyState compact icon={TrendingUp} title="Данных пока нет" description="Ответьте на несколько вопросов." />
          ) : (
            <div className="space-y-3.5">
              {strongTopics.map((topic) => (
                <ProgressBar
                  key={topic.topic}
                  label={topic.topic}
                  valueLabel={formatScore(topic.avg_score)}
                  value={(topic.avg_score / 10) * 100}
                  tone={toneByScore(topic.avg_score)}
                  size="sm"
                />
              ))}
            </div>
          )}

          {!loading && difficultyEntries.length > 0 ? (
            <div className="mt-5 border-t border-white/5 pt-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-500">По сложности</p>
              <div className="space-y-2.5">
                {difficultyEntries.map(([difficulty, score]) => (
                  <ProgressBar
                    key={difficulty}
                    label={labelOf(DIFFICULTY_LABELS, difficulty)}
                    valueLabel={formatScore(score)}
                    value={(score / 10) * 100}
                    tone={toneByScore(score)}
                    size="sm"
                  />
                ))}
              </div>
            </div>
          ) : null}
        </Card>
      </div>

      {/* CTA */}
      <div className="relative mt-5 overflow-hidden rounded-2xl border border-accent-400/25 bg-gradient-to-r from-accent-600/25 via-violet-600/15 to-ink-900 p-6 sm:p-8">
        <div className="absolute inset-0 bg-grid opacity-40" aria-hidden="true" />
        <div className="relative flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-50">Готовы проверить себя?</h2>
            <p className="mt-1 max-w-xl text-sm text-slate-300/80">
              Выберите направление и уровень — ИИ соберёт вопросы и оценит ответы по четырём критериям.
            </p>
          </div>
          <Button size="lg" onClick={() => navigate('/interview/new')} rightIcon={<ArrowRight className="h-4 w-4" />}>
            Начать собеседование
          </Button>
        </div>
      </div>
    </div>
  )
}

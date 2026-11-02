import {
  AlertCircle,
  ArrowRight,
  Code2,
  Flame,
  Layers,
  ListChecks,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { PageHeader } from '@/components/PageHeader'
import { SessionTable } from '@/components/SessionTable'
import { StatCard } from '@/components/StatCard'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { ProgressBar, toneByScore } from '@/components/ui/ProgressBar'
import { Segmented } from '@/components/ui/Segmented'
import { Skeleton, SkeletonStatCard, SkeletonTableRows } from '@/components/ui/Skeleton'
import { Tabs } from '@/components/ui/Tabs'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { api } from '@/lib/api'
import { formatNumber, formatScore, plural } from '@/lib/format'
import { DIFFICULTY_LABELS, labelOf } from '@/lib/labels'
import type { AnalyticsOut, SessionSummary } from '@/lib/types'

type DashboardTab = 'overview' | 'sessions' | 'topics'
type Period = '30' | '90' | 'all'

const PERIOD_OPTIONS: Array<{ value: Period; label: string }> = [
  { value: '30', label: '30 дней' },
  { value: '90', label: '90 дней' },
  { value: 'all', label: 'Всё время' },
]

function shortDate(value: string): string {
  return value.length >= 10 ? `${value.slice(8, 10)}.${value.slice(5, 7)}` : value
}

export function DashboardPage() {
  const { user } = useAuth()
  const { resolved } = useTheme()
  const navigate = useNavigate()

  const [data, setData] = useState<AnalyticsOut | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<DashboardTab>('overview')
  const [period, setPeriod] = useState<Period>('90')

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

  const firstName = user?.full_name?.trim().split(/\s+/)[0] || 'коллега'
  const inProgress: SessionSummary | undefined = (data?.recent_sessions ?? []).find(
    (session) => session.status === 'in_progress',
  )
  const weakTopics = (data?.weak_topics ?? []).slice(0, 5)
  const strongTopics = (data?.strong_topics ?? []).slice(0, 5)
  const difficultyEntries = Object.entries(data?.difficulty_stats ?? {})
  const recentSessions = data?.recent_sessions ?? []
  const hasData = (data?.sessions_count ?? 0) > 0

  const chartData = useMemo(() => {
    const history = data?.score_history ?? []
    if (period === 'all') return history.map((point) => ({ date: point.date, score: point.score }))
    const days = period === '30' ? 30 : 90
    const cutoff = Date.now() - days * 86_400_000
    return history
      .filter((point) => new Date(`${point.date}T00:00:00`).getTime() >= cutoff)
      .map((point) => ({ date: point.date, score: point.score }))
  }, [data, period])

  const palette =
    resolved === 'dark'
      ? { line: '#3b82f6', fill: '#3b82f6', grid: '#262e39', axis: '#7b8794', tooltip: '#11161d', tooltipText: '#e6e9ee' }
      : { line: '#2563eb', fill: '#2563eb', grid: '#e2e8f0', axis: '#64748b', tooltip: '#ffffff', tooltipText: '#0f172a' }

  const nextSteps = useMemo(() => {
    const steps: Array<{ icon: typeof Target; title: string; description: string; href: string }> = []
    const weakest = weakTopics[0]
    if (weakest) {
      steps.push({
        icon: Target,
        title: `Сессия с фокусом на «${weakest.topic}»`,
        description: `Средний балл по теме — ${formatScore(weakest.avg_score)} из 10`,
        href: '/interview/new',
      })
    }
    steps.push({
      icon: Code2,
      title: 'Задача с кодом и разбором',
      description: 'Практика с ИИ-ревью: оценка, замечания и улучшенный вариант',
      href: '/code',
    })
    steps.push({
      icon: Flame,
      title:
        (data?.streak_days ?? 0) > 0
          ? `Серия ${data?.streak_days} ${plural(data?.streak_days ?? 0, ['день', 'дня', 'дней'])}`
          : 'Начните серию занятий',
      description: 'Регулярные короткие сессии дают больше, чем редкие длинные',
      href: '/interview/new',
    })
    return steps
  }, [data?.streak_days, weakTopics])

  const tabs = useMemo(
    () => [
      { id: 'overview', label: 'Обзор' },
      { id: 'sessions', label: 'Сессии', count: data?.sessions_count ?? 0 },
      { id: 'topics', label: 'Темы' },
    ],
    [data?.sessions_count],
  )

  return (
    <div>
      <PageHeader
        title={`Здравствуйте, ${firstName}`}
        description="Сводка по подготовке: динамика баллов, слабые темы и последние собеседования."
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/history')}>
              История
            </Button>
            <Button onClick={() => navigate('/interview/new')} leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}>
              Новое собеседование
            </Button>
          </>
        }
      />

      {error ? (
        <Card className="mb-4 border-negative/25 p-4">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-negative" aria-hidden="true" />
              <div>
                <p className="text-14 font-medium text-fg">Не удалось загрузить данные</p>
                <p className="mt-0.5 text-13 text-fg-2">{error}</p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => void load()} leftIcon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}>
              Повторить
            </Button>
          </div>
        </Card>
      ) : null}

      {inProgress ? (
        <Card className="mb-4 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-14 font-medium text-fg">Незавершённая сессия #{inProgress.id}</p>
              <p className="mt-0.5 text-13 text-fg-2">
                Отвечено {inProgress.answered_count} из {inProgress.question_count} вопросов
              </p>
            </div>
            <Button variant="secondary" onClick={() => navigate(`/interview/${inProgress.id}`)} rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}>
              Продолжить
            </Button>
          </div>
        </Card>
      ) : null}

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SkeletonStatCard />
            <SkeletonStatCard />
            <SkeletonStatCard />
            <SkeletonStatCard />
          </div>
          <div className="grid grid-cols-12 gap-4">
            <Skeleton className="col-span-12 h-72 rounded-lg xl:col-span-8" />
            <Skeleton className="col-span-12 h-72 rounded-lg xl:col-span-4" />
          </div>
          <SkeletonTableRows rows={4} />
        </div>
      ) : data ? (
        <>
          <Tabs
            items={tabs}
            value={tab}
            onChange={(id) => setTab(id as DashboardTab)}
            ariaLabel="Разделы дашборда"
          />

          <div className="mt-5" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
            {tab === 'overview' ? (
              <div className="space-y-4">
                {!hasData ? (
                  <Card className="p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-14 font-medium text-fg">Начните с первого собеседования</p>
                        <p className="mt-1 max-w-xl text-13 leading-relaxed text-fg-2">
                          Ответьте на 3–5 вопросов по своей теме — после этого здесь появятся динамика баллов,
                          слабые темы и рекомендации.
                        </p>
                      </div>
                      <Button onClick={() => navigate('/interview/new')} leftIcon={<Sparkles className="h-4 w-4" aria-hidden="true" />}>
                        Начать собеседование
                      </Button>
                    </div>
                  </Card>
                ) : null}

                <p className="text-12 text-fg-3">Показатели за всё время</p>

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <StatCard
                    label="Всего сессий"
                    value={formatNumber(data.sessions_count)}
                    hint={`завершено ${formatNumber(data.completed_sessions)}`}
                    icon={Layers}
                  />
                  <StatCard
                    label="Средний балл"
                    value={formatScore(data.avg_score)}
                    hint={`лучший результат ${formatScore(data.best_score)}`}
                    icon={Target}
                  />
                  <StatCard
                    label="Отвечено вопросов"
                    value={formatNumber(data.questions_answered)}
                    hint="за всё время"
                    icon={ListChecks}
                  />
                  <StatCard
                    label="Серия занятий"
                    value={data.streak_days}
                    hint={`${plural(data.streak_days, ['день', 'дня', 'дней'])} подряд`}
                    icon={Flame}
                  />
                </div>

                <div className="grid grid-cols-12 gap-3 sm:gap-4">
                  <Card className="col-span-12 p-5 xl:col-span-8">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-14 font-semibold text-fg">Динамика баллов</h2>
                        <p className="mt-0.5 text-13 text-fg-2">Средний балл завершённых сессий</p>
                      </div>
                      <Segmented
                        options={PERIOD_OPTIONS}
                        value={period}
                        onChange={setPeriod}
                        ariaLabel="Период графика"
                      />
                    </div>

                    {chartData.length === 0 ? (
                      <EmptyState
                        compact
                        className="mt-4"
                        icon={TrendingUp}
                        title="За выбранный период данных нет"
                        description="Пройдите сессию или выберите больший период."
                        action={
                          <Button variant="secondary" size="sm" onClick={() => setPeriod('all')}>
                            Всё время
                          </Button>
                        }
                      />
                    ) : (
                      <div className="mt-4 h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                            <CartesianGrid stroke={palette.grid} vertical={false} />
                            <XAxis
                              dataKey="date"
                              tickFormatter={shortDate}
                              tick={{ fill: palette.axis, fontSize: 12 }}
                              axisLine={false}
                              tickLine={false}
                              minTickGap={16}
                            />
                            <YAxis
                              domain={[0, 10]}
                              ticks={[0, 2, 4, 6, 8, 10]}
                              tick={{ fill: palette.axis, fontSize: 12 }}
                              axisLine={false}
                              tickLine={false}
                              width={36}
                            />
                            <Tooltip
                              cursor={{ stroke: palette.grid }}
                              contentStyle={{
                                background: palette.tooltip,
                                border: `1px solid ${palette.grid}`,
                                borderRadius: 6,
                                boxShadow: resolved === 'dark' ? '0 8px 24px rgba(0,0,0,.5)' : '0 4px 16px rgba(15,23,42,.1)',
                                fontSize: 12,
                                color: palette.tooltipText,
                              }}
                              labelStyle={{ color: palette.axis }}
                              itemStyle={{ color: palette.tooltipText }}
                              labelFormatter={(label) => (typeof label === 'string' ? shortDate(label) : label)}
                              formatter={(value) => [`${formatScore(Number(value))} из 10`, 'Балл']}
                            />
                            <Area
                              type="monotone"
                              dataKey="score"
                              stroke={palette.line}
                              strokeWidth={2}
                              fill={palette.fill}
                              fillOpacity={0.08}
                              dot={{ r: 2.5, fill: palette.line, strokeWidth: 0 }}
                              activeDot={{ r: 4, fill: palette.line, strokeWidth: 0 }}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </Card>

                  <Card className="col-span-12 p-5 xl:col-span-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-14 font-semibold text-fg">Темы для повторения</h2>
                        <p className="mt-0.5 text-13 text-fg-2">На основе средних баллов</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setTab('topics')}
                        className="text-13 font-medium text-accent transition-colors hover:text-accent-hover"
                      >
                        Все темы
                      </button>
                    </div>

                    {weakTopics.length === 0 ? (
                      <EmptyState
                        compact
                        className="mt-4"
                        icon={TrendingDown}
                        title="Слабых тем пока нет"
                        description="Появятся после нескольких ответов по разным темам."
                      />
                    ) : (
                      <ul className="mt-4 space-y-3.5">
                        {weakTopics.map((topic) => (
                          <li key={topic.topic}>
                            <ProgressBar
                              label={topic.topic}
                              valueLabel={formatScore(topic.avg_score)}
                              value={(topic.avg_score / 10) * 100}
                              tone={toneByScore(topic.avg_score)}
                              size="sm"
                            />
                            <p className="mt-1 text-12 text-fg-3">
                              {topic.answers_count} {plural(topic.answers_count, ['ответ', 'ответа', 'ответов'])}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                </div>

                <div className="grid grid-cols-12 gap-3 sm:gap-4">
                  <Card className="col-span-12 overflow-hidden xl:col-span-8">
                    <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                      <h2 className="text-14 font-semibold text-fg">Последние сессии</h2>
                      <Link to="/history" className="text-13 font-medium text-accent transition-colors hover:text-accent-hover">
                        Вся история
                      </Link>
                    </div>
                    {recentSessions.length === 0 ? (
                      <EmptyState
                        compact
                        className="m-4"
                        icon={Layers}
                        title="Сессий пока нет"
                        description="Создайте первую сессию — она появится в списке."
                        action={<Button size="sm" onClick={() => navigate('/interview/new')}>Начать собеседование</Button>}
                      />
                    ) : (
                      <SessionTable sessions={recentSessions.slice(0, 5)} />
                    )}
                  </Card>

                  <Card className="col-span-12 p-5 xl:col-span-4">
                    <h2 className="text-14 font-semibold text-fg">Следующие шаги</h2>
                    <p className="mt-0.5 text-13 text-fg-2">Что даст наибольший прирост</p>
                    <ul className="mt-2 divide-y divide-line">
                      {nextSteps.map((step) => {
                        const Icon = step.icon
                        return (
                          <li key={step.title}>
                            <Link
                              to={step.href}
                              className="-mx-2 flex items-start gap-2.5 rounded-md px-2 py-3 transition-colors hover:bg-surface-2"
                            >
                              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-fg-3" aria-hidden="true" />
                              <span className="min-w-0">
                                <span className="block text-13 font-medium text-fg">{step.title}</span>
                                <span className="block text-12 leading-relaxed text-fg-3">{step.description}</span>
                              </span>
                            </Link>
                          </li>
                        )
                      })}
                    </ul>
                  </Card>
                </div>
              </div>
            ) : null}

            {tab === 'sessions' ? (
              <Card className="overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                  <div>
                    <h2 className="text-14 font-semibold text-fg">Недавние сессии</h2>
                    <p className="mt-0.5 text-13 text-fg-2">Всего {formatNumber(data.sessions_count)} за всё время</p>
                  </div>
                  <Link to="/history" className="text-13 font-medium text-accent transition-colors hover:text-accent-hover">
                    Открыть историю
                  </Link>
                </div>
                {recentSessions.length === 0 ? (
                  <EmptyState
                    className="m-4"
                    icon={Layers}
                    title="История пуста"
                    description="Пройдите первое собеседование, чтобы увидеть здесь результаты."
                    action={<Button onClick={() => navigate('/interview/new')}>Начать собеседование</Button>}
                  />
                ) : (
                  <SessionTable sessions={recentSessions} />
                )}
              </Card>
            ) : null}

            {tab === 'topics' ? (
              <div className="grid grid-cols-12 gap-3 sm:gap-4">
                <Card className="col-span-12 p-5 lg:col-span-6">
                  <h2 className="text-14 font-semibold text-fg">Слабые темы</h2>
                  <p className="mt-0.5 text-13 text-fg-2">Стоит повторить в первую очередь</p>
                  {weakTopics.length === 0 ? (
                    <EmptyState
                      compact
                      className="mt-4"
                      icon={TrendingDown}
                      title="Слабых тем нет"
                      description="Ответьте на вопросы разных тем — статистика появится автоматически."
                    />
                  ) : (
                    <ul className="mt-4 space-y-3.5">
                      {weakTopics.map((topic) => (
                        <li key={topic.topic}>
                          <ProgressBar
                            label={topic.topic}
                            valueLabel={formatScore(topic.avg_score)}
                            value={(topic.avg_score / 10) * 100}
                            tone={toneByScore(topic.avg_score)}
                            size="sm"
                          />
                          <p className="mt-1 text-12 text-fg-3">
                            {topic.answers_count} {plural(topic.answers_count, ['ответ', 'ответа', 'ответов'])}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>

                <Card className="col-span-12 p-5 lg:col-span-6">
                  <h2 className="text-14 font-semibold text-fg">Сильные темы</h2>
                  <p className="mt-0.5 text-13 text-fg-2">Здесь вы уже отвечаете уверенно</p>
                  {strongTopics.length === 0 ? (
                    <EmptyState
                      compact
                      className="mt-4"
                      icon={TrendingUp}
                      title="Данных пока нет"
                      description="Ответьте на несколько вопросов, чтобы увидеть сильные стороны."
                    />
                  ) : (
                    <ul className="mt-4 space-y-3.5">
                      {strongTopics.map((topic) => (
                        <li key={topic.topic}>
                          <ProgressBar
                            label={topic.topic}
                            valueLabel={formatScore(topic.avg_score)}
                            value={(topic.avg_score / 10) * 100}
                            tone={toneByScore(topic.avg_score)}
                            size="sm"
                          />
                          <p className="mt-1 text-12 text-fg-3">
                            {topic.answers_count} {plural(topic.answers_count, ['ответ', 'ответа', 'ответов'])}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>

                <Card className="col-span-12 p-5">
                  <h2 className="text-14 font-semibold text-fg">Средний балл по сложности</h2>
                  <p className="mt-0.5 text-13 text-fg-2">Насколько уверенно вы держитесь на каждом уровне</p>
                  {difficultyEntries.length === 0 ? (
                    <EmptyState compact className="mt-4" icon={Target} title="Данных пока нет" description="Пройдите сессию с вопросами разной сложности." />
                  ) : (
                    <div className="mt-4 grid gap-4 sm:grid-cols-3">
                      {difficultyEntries.map(([difficulty, score]) => (
                        <div key={difficulty}>
                          <ProgressBar
                            label={labelOf(DIFFICULTY_LABELS, difficulty)}
                            valueLabel={formatScore(score)}
                            value={(score / 10) * 100}
                            tone={toneByScore(score)}
                            size="sm"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  )
}

import { AlertCircle, BrainCircuit, RefreshCw, Save } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'

import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton'
import { useAiStatus } from '@/context/AiStatusContext'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { ApiError, api } from '@/lib/api'
import { formatDate, formatDateTime } from '@/lib/format'
import { LEVEL_LABELS, ROLE_LABELS, labelOf } from '@/lib/labels'
import type { MetaOut } from '@/lib/types'

export function ProfilePage() {
  const { user, setUser } = useAuth()
  const toast = useToast()
  const { health, latencyMs, loading: aiLoading, error: aiError, checkedAt, refresh: refreshAi } = useAiStatus()

  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState('backend')
  const [level, setLevel] = useState('junior')
  const [resume, setResume] = useState('')

  const [meta, setMeta] = useState<MetaOut | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const loadProfile = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [profile, metaData] = await Promise.all([api.profile.get(), api.meta()])
      setFullName(profile.full_name ?? '')
      setRole(profile.target_role ?? 'backend')
      setLevel(profile.target_level ?? 'junior')
      setResume(profile.resume_text ?? '')
      setMeta(metaData)
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : 'Не удалось загрузить профиль.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadProfile()
  }, [loadProfile])

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (saving) return
    if (fullName.trim().length < 2) {
      toast.error('Имя должно содержать минимум 2 символа.')
      return
    }
    setSaving(true)
    try {
      const updated = await api.profile.update({
        full_name: fullName.trim(),
        target_role: role,
        target_level: level,
        resume_text: resume,
      })
      setUser(updated)
      setFullName(updated.full_name)
      setRole(updated.target_role)
      setLevel(updated.target_level)
      toast.success('Профиль сохранён')
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.detail : 'Не удалось сохранить профиль. Попробуйте ещё раз.')
    } finally {
      setSaving(false)
    }
  }

  const aiTone = aiError ? 'bg-negative' : health?.mode === 'live' ? 'bg-positive' : health ? 'bg-caution' : 'bg-fg-3'

  return (
    <div>
      <PageHeader
        title="Профиль"
        description="Данные используются для персональных вопросов, задач и рекомендаций."
      />

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 xl:col-span-8">
          {loading ? (
            <Card className="p-5">
              <SkeletonText lines={2} />
              <div className="mt-5 space-y-4">
                <Skeleton className="h-10 w-full rounded-md" />
                <Skeleton className="h-10 w-full rounded-md" />
                <Skeleton className="h-10 w-full rounded-md" />
                <Skeleton className="h-32 w-full rounded-md" />
              </div>
            </Card>
          ) : error ? (
            <Card className="border-negative/25 p-4">
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-negative" aria-hidden="true" />
                  <div>
                    <p className="text-14 font-medium text-fg">Не удалось загрузить профиль</p>
                    <p className="mt-0.5 text-13 text-fg-2">{error}</p>
                  </div>
                </div>
                <Button variant="secondary" size="sm" onClick={() => void loadProfile()} leftIcon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}>
                  Повторить
                </Button>
              </div>
            </Card>
          ) : (
            <Card className="p-5">
              <CardHeader title="Личные данные" description="Имя и цель подготовки" />
              <form onSubmit={handleSave} className="space-y-4">
                <Field label="Имя" htmlFor="profile_name" required>
                  <Input
                    id="profile_name"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Алексей Смирнов"
                    maxLength={255}
                    autoComplete="name"
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Направление" htmlFor="profile_role">
                    <Select id="profile_role" value={role} onChange={(event) => setRole(event.target.value)}>
                      {(meta?.roles ?? []).map((item) => (
                        <option key={item.code} value={item.code}>
                          {item.title || labelOf(ROLE_LABELS, item.code)}
                        </option>
                      ))}
                      {meta?.roles.length === 0 ? <option value={role}>{labelOf(ROLE_LABELS, role)}</option> : null}
                    </Select>
                  </Field>

                  <Field label="Уровень" htmlFor="profile_level">
                    <Select id="profile_level" value={level} onChange={(event) => setLevel(event.target.value)}>
                      {(meta?.levels ?? []).map((item) => (
                        <option key={item.code} value={item.code}>
                          {item.title || labelOf(LEVEL_LABELS, item.code)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                <Field
                  label="Резюме"
                  htmlFor="profile_resume"
                  hint="Коротко об опыте: ИИ учитывает это при генерации вопросов и задач."
                >
                  <Textarea
                    id="profile_resume"
                    value={resume}
                    onChange={(event) => setResume(event.target.value)}
                    placeholder="3 года коммерческой разработки на Python: FastAPI, PostgreSQL, Docker…"
                    className="!min-h-40"
                  />
                </Field>

                <div className="flex justify-end border-t border-line pt-4">
                  <Button type="submit" loading={saving} leftIcon={<Save className="h-4 w-4" aria-hidden="true" />}>
                    Сохранить изменения
                  </Button>
                </div>
              </form>
            </Card>
          )}
        </div>

        <div className="col-span-12 space-y-4 xl:col-span-4">
          <Card className="p-5">
            <CardHeader title="Аккаунт" description="Учётные данные" />
            <dl className="space-y-3 text-13">
              <div>
                <dt className="text-12 text-fg-3">Email</dt>
                <dd className="mt-0.5 break-all text-fg">{user?.email ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-12 text-fg-3">Дата регистрации</dt>
                <dd className="mt-0.5 text-fg">{user ? formatDate(user.created_at) : '—'}</dd>
              </div>
              <div>
                <dt className="mb-1 text-12 text-fg-3">Цель подготовки</dt>
                <dd className="flex flex-wrap gap-2">
                  <Badge tone="accent">{labelOf(ROLE_LABELS, user?.target_role)}</Badge>
                  <Badge>{labelOf(LEVEL_LABELS, user?.target_level)}</Badge>
                </dd>
              </div>
            </dl>
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h2 className="flex items-center gap-2 text-14 font-semibold text-fg">
                  <BrainCircuit className="h-4 w-4 text-fg-3" aria-hidden="true" />
                  Состояние ИИ
                </h2>
                <p className="mt-0.5 text-13 text-fg-2">Движок, который оценивает ответы</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void refreshAi()}
                loading={aiLoading}
                aria-label="Обновить состояние ИИ"
                leftIcon={aiLoading ? undefined : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
              >
                Обновить
              </Button>
            </div>

            {aiLoading && !health ? (
              <div className="space-y-2">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ) : aiError ? (
              <div className="rounded-md border border-negative/25 bg-negative-soft p-3 text-13 leading-relaxed text-negative">
                {aiError}
              </div>
            ) : health ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`h-1.5 w-1.5 rounded-full ${aiTone}`} aria-hidden="true" />
                  <Badge tone={health.mode === 'live' ? 'positive' : 'caution'}>
                    {health.mode === 'live' ? 'live' : 'offline'}
                  </Badge>
                  <Badge tone={health.available ? 'positive' : 'negative'}>
                    {health.available ? 'доступен' : 'недоступен'}
                  </Badge>
                </div>

                <dl className="divide-y divide-line text-13">
                  <div className="flex items-baseline justify-between gap-3 py-2">
                    <dt className="text-fg-2">Провайдер</dt>
                    <dd className="truncate text-right text-fg">{health.provider || '—'}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 py-2">
                    <dt className="text-fg-2">Модель</dt>
                    <dd className="truncate text-right text-fg">{health.model || '—'}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 py-2">
                    <dt className="text-fg-2">Задержка ответа</dt>
                    <dd className="tabular-nums text-fg">{latencyMs != null ? `${latencyMs} мс` : '—'}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 py-2">
                    <dt className="text-fg-2">Проверено</dt>
                    <dd className="text-right text-fg">{checkedAt ? formatDateTime(new Date(checkedAt).toISOString()) : '—'}</dd>
                  </div>
                </dl>

                {health.message ? (
                  <p className="rounded-md border border-line bg-surface-2 p-3 text-12 leading-relaxed text-fg-2">
                    {health.message}
                  </p>
                ) : null}

                {health.mode === 'offline' ? (
                  <p className="text-12 leading-relaxed text-fg-3">
                    Офлайн-режим: вопросы берутся из встроенного банка, оценки считаются эвристиками. Функциональность
                    полная, внешний ключ API не требуется.
                  </p>
                ) : null}
              </div>
            ) : null}
          </Card>

          {user ? (
            <Card className="p-4">
              <p className="text-12 leading-relaxed text-fg-3">
                Аккаунт создан {formatDateTime(user.created_at)}. Изменения профиля применяются к новым сессиям и
                задачам.
              </p>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  )
}

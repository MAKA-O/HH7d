import {
  AlertCircle,
  BrainCircuit,
  Mail,
  RefreshCw,
  Save,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'

import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { ApiError, api } from '@/lib/api'
import { formatDate, formatDateTime } from '@/lib/format'
import { LEVEL_LABELS, ROLE_LABELS, labelOf } from '@/lib/labels'
import type { AIHealthOut, MetaOut, UserOut } from '@/lib/types'

/** Ответ профиля может содержать resume_text (поле есть в ProfileIn, в UserOut — по контракту нет). */
type ProfileResponse = UserOut & { resume_text?: string }

export function ProfilePage() {
  const { user, setUser } = useAuth()
  const toast = useToast()

  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState('backend')
  const [level, setLevel] = useState('junior')
  const [resume, setResume] = useState('')

  const [meta, setMeta] = useState<MetaOut | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [aiHealth, setAiHealth] = useState<AIHealthOut | null>(null)
  const [aiLoading, setAiLoading] = useState(true)
  const [aiError, setAiError] = useState<string | null>(null)

  const loadProfile = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [profile, metaData] = await Promise.all([
        api.profile.get() as Promise<ProfileResponse>,
        api.meta(),
      ])
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

  const loadAiHealth = useCallback(async () => {
    setAiLoading(true)
    setAiError(null)
    try {
      setAiHealth(await api.aiHealth())
    } catch (caught) {
      setAiError(caught instanceof Error && caught.message ? caught.message : 'Не удалось получить состояние ИИ.')
    } finally {
      setAiLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadProfile()
    void loadAiHealth()
  }, [loadProfile, loadAiHealth])

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

  return (
    <div>
      <PageHeader
        eyebrow="Профиль"
        title="Настройки и состояние ИИ"
        description="Данные профиля используются для персонализации вопросов и задач с кодом."
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Форма профиля */}
        <div className="lg:col-span-2">
          {loading ? (
            <Card>
              <SkeletonText lines={2} />
              <div className="mt-5 space-y-4">
                <Skeleton className="h-11 w-full rounded-xl" />
                <Skeleton className="h-11 w-full rounded-xl" />
                <Skeleton className="h-11 w-full rounded-xl" />
                <Skeleton className="h-32 w-full rounded-xl" />
              </div>
            </Card>
          ) : error ? (
            <Card className="border-rose-500/25 bg-rose-500/[0.04]">
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium text-rose-100">Не удалось загрузить профиль</p>
                    <p className="mt-0.5 text-xs text-rose-200/70">{error}</p>
                  </div>
                </div>
                <Button variant="secondary" size="sm" onClick={() => void loadProfile()} leftIcon={<RefreshCw className="h-4 w-4" />}>
                  Повторить
                </Button>
              </div>
            </Card>
          ) : (
            <Card>
              <CardHeader
                title="Личные данные"
                description="Имя и цели подготовки"
                icon={<UserRound className="h-4 w-4" />}
              />
              <form onSubmit={handleSave} className="space-y-4">
                <Field label="Имя" htmlFor="profile_name" required>
                  <Input
                    id="profile_name"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Иван Петров"
                    maxLength={255}
                    icon={<UserRound className="h-4 w-4" aria-hidden="true" />}
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
                  hint="Коротко о вашем опыте: ИИ учитывает это при генерации вопросов и задач."
                >
                  <Textarea
                    id="profile_resume"
                    value={resume}
                    onChange={(event) => setResume(event.target.value)}
                    placeholder="3 года коммерческой разработки на Python: FastAPI, PostgreSQL, Docker…"
                    className="!min-h-40"
                  />
                </Field>

                <div className="flex justify-end">
                  <Button type="submit" loading={saving} leftIcon={<Save className="h-4 w-4" />}>
                    Сохранить изменения
                  </Button>
                </div>
              </form>
            </Card>
          )}
        </div>

        {/* Аккаунт и ИИ */}
        <div className="space-y-5">
          <Card>
            <CardHeader title="Аккаунт" description="Учётные данные" icon={<Mail className="h-4 w-4" />} />
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wider text-slate-500">Email</dt>
                <dd className="mt-0.5 break-all text-slate-200">{user?.email ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-slate-500">Дата регистрации</dt>
                <dd className="mt-0.5 text-slate-200">{user ? formatDate(user.created_at) : '—'}</dd>
              </div>
              <div>
                <dt className="mb-1 text-xs uppercase tracking-wider text-slate-500">Цель</dt>
                <dd className="flex flex-wrap gap-2">
                  <Badge tone="accent">{labelOf(ROLE_LABELS, user?.target_role)}</Badge>
                  <Badge>{labelOf(LEVEL_LABELS, user?.target_level)}</Badge>
                </dd>
              </div>
            </dl>
          </Card>

          <Card>
            <CardHeader
              title="Состояние ИИ"
              description="Движок, который оценивает ответы"
              icon={<BrainCircuit className="h-4 w-4" />}
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void loadAiHealth()}
                  loading={aiLoading}
                  aria-label="Обновить состояние ИИ"
                  leftIcon={aiLoading ? undefined : <RefreshCw className="h-3.5 w-3.5" />}
                >
                  Обновить
                </Button>
              }
            />

            {aiLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-2/3" />
              </div>
            ) : aiError ? (
              <div className="rounded-xl border border-rose-500/25 bg-rose-500/[0.06] p-3.5 text-xs leading-relaxed text-rose-200">
                {aiError}
              </div>
            ) : aiHealth ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={aiHealth.mode === 'live' ? 'success' : 'warning'} icon={<ShieldCheck className="h-3 w-3" />}>
                    {aiHealth.mode === 'live' ? 'live' : 'offline'}
                  </Badge>
                  <Badge tone={aiHealth.available ? 'success' : 'danger'}>
                    {aiHealth.available ? 'доступен' : 'недоступен'}
                  </Badge>
                </div>
                <dl className="space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-slate-500">Провайдер</dt>
                    <dd className="truncate text-right text-slate-200">{aiHealth.provider || '—'}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-slate-500">Модель</dt>
                    <dd className="truncate text-right text-slate-200">{aiHealth.model || '—'}</dd>
                  </div>
                </dl>
                {aiHealth.message ? (
                  <p className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs leading-relaxed text-slate-400">
                    {aiHealth.message}
                  </p>
                ) : null}
                {aiHealth.mode === 'offline' ? (
                  <p className="text-[11px] leading-relaxed text-slate-500">
                    Офлайн-режим: вопросы берутся из встроенного банка, оценки считаются эвристиками. Весь
                    функционал доступен без ключа API.
                  </p>
                ) : null}
              </div>
            ) : null}
          </Card>

          {user ? (
            <Card className="p-4">
              <p className="text-xs leading-relaxed text-slate-500">
                Профиль создан {formatDateTime(user.created_at)}. Изменения применяются к новым сессиям и задачам.
              </p>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  )
}

import { AlertCircle, Eye, EyeOff, LogIn, Lock, Mail } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { AuthLayout } from '@/components/AuthLayout'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { useAuth } from '@/context/AuthContext'
import { ApiError } from '@/lib/api'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/'

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return
    setError(null)

    const trimmedEmail = email.trim()
    if (!trimmedEmail || !password) {
      setError('Введите email и пароль.')
      return
    }

    setSubmitting(true)
    try {
      await login(trimmedEmail, password)
      navigate(redirectTo, { replace: true })
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.detail : 'Не удалось войти. Проверьте соединение с сервером и повторите попытку.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Вход в аккаунт"
      subtitle="Продолжите подготовку: ваши сессии, оценки и история сохраняются."
      footer={
        <p>
          Нет аккаунта?{' '}
          <Link to="/register" className="font-medium text-accent-300 transition hover:text-accent-200">
            Зарегистрируйтесь
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error ? (
          <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-3 text-sm text-rose-200" role="alert">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        <Field label="Email" htmlFor="email" required>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="student@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            icon={<Mail className="h-4 w-4" aria-hidden="true" />}
            required
          />
        </Field>

        <Field label="Пароль" htmlFor="password" required>
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Минимум 6 символов"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            icon={<Lock className="h-4 w-4" aria-hidden="true" />}
            rightSlot={
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-white/5 hover:text-slate-300"
              >
                {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
              </button>
            }
            required
          />
        </Field>

        <Button type="submit" fullWidth size="lg" loading={submitting} leftIcon={<LogIn className="h-4 w-4" aria-hidden="true" />}>
          Войти
        </Button>
      </form>
    </AuthLayout>
  )
}

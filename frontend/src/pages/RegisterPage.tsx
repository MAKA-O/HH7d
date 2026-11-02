import { AlertCircle, Eye, EyeOff, Lock, Mail, UserPlus, UserRound } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { AuthLayout } from '@/components/AuthLayout'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { useAuth } from '@/context/AuthContext'
import { ApiError } from '@/lib/api'

export function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordRepeat, setPasswordRepeat] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const validate = (): string | null => {
    if (fullName.trim().length < 2) return 'Укажите имя — так будет удобнее в интерфейсе.'
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return 'Введите корректный email.'
    if (password.length < 6) return 'Пароль должен содержать минимум 6 символов.'
    if (password !== passwordRepeat) return 'Пароли не совпадают.'
    return null
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setError(null)
    setSubmitting(true)
    try {
      await register(email.trim(), password, fullName.trim())
      navigate('/', { replace: true })
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.detail
          : 'Не удалось зарегистрироваться. Проверьте соединение с сервером и повторите попытку.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Создание аккаунта"
      subtitle="Минута на регистрацию — и первое ИИ-собеседование можно начинать."
      footer={
        <p>
          Уже есть аккаунт?{' '}
          <Link to="/login" className="text-link">
            Войти
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error ? (
          <div
            className="flex items-start gap-2 rounded-md border border-negative/25 bg-negative-soft px-3 py-2.5 text-13 text-negative"
            role="alert"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        <Field label="Как вас зовут" htmlFor="full_name" required>
          <Input
            id="full_name"
            type="text"
            autoComplete="name"
            placeholder="Алексей Смирнов"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            icon={<UserRound className="h-4 w-4" aria-hidden="true" />}
            required
          />
        </Field>

        <Field label="Email" htmlFor="email" required>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="alexey.smirnov@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            icon={<Mail className="h-4 w-4" aria-hidden="true" />}
            required
          />
        </Field>

        <Field label="Пароль" htmlFor="password" hint="Минимум 6 символов" required>
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Придумайте пароль"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            icon={<Lock className="h-4 w-4" aria-hidden="true" />}
            rightSlot={
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md text-fg-3 transition-colors hover:bg-surface-2 hover:text-fg"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            }
            required
          />
        </Field>

        <Field label="Повторите пароль" htmlFor="password_repeat" required>
          <Input
            id="password_repeat"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Ещё раз"
            value={passwordRepeat}
            onChange={(event) => setPasswordRepeat(event.target.value)}
            icon={<Lock className="h-4 w-4" aria-hidden="true" />}
            required
          />
        </Field>

        <Button
          type="submit"
          fullWidth
          size="lg"
          loading={submitting}
          leftIcon={<UserPlus className="h-4 w-4" aria-hidden="true" />}
        >
          Создать аккаунт
        </Button>
      </form>
    </AuthLayout>
  )
}

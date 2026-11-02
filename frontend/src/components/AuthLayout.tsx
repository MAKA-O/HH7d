import type { ReactNode } from 'react'
import { Check } from 'lucide-react'

import { Brand } from '@/components/Brand'

const STEPS = [
  'Выберите направление, уровень и темы — ИИ соберёт сессию за пару секунд.',
  'Отвечайте текстом или голосом: оценка по правильности, полноте, глубине и ясности.',
  'Разбирайте эталонный ответ и рекомендации, следите за динамикой баллов.',
]

interface AuthLayoutProps {
  title: string
  subtitle: string
  children: ReactNode
  footer: ReactNode
}

/** Раскладка входа и регистрации: форма слева, поясняющая панель справа. */
export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen bg-canvas">
      <main className="flex w-full flex-col px-6 py-8 lg:w-[520px] lg:shrink-0 lg:border-r lg:border-line lg:px-12 lg:py-10">
        <Brand />
        <div className="flex flex-1 items-center py-8">
          <div className="w-full max-w-[360px]">
            <h1 className="text-24 font-semibold tracking-tight text-fg">{title}</h1>
            <p className="mt-1.5 text-14 leading-relaxed text-fg-2">{subtitle}</p>
            <div className="mt-6">{children}</div>
            <div className="mt-6 text-13 text-fg-2">{footer}</div>
          </div>
        </div>
        <p className="text-12 text-fg-3">© 2026 Тренажёр собеседований</p>
      </main>

      <aside className="hidden flex-1 bg-surface-2 lg:flex lg:flex-col lg:justify-center lg:px-12">
        <div className="max-w-[420px]">
          <p className="eyebrow">Как проходит подготовка</p>
          <h2 className="mt-2 text-20 font-semibold tracking-tight text-fg">
            От первого ответа до уверенного интервью
          </h2>
          <ol className="mt-6 space-y-4">
            {STEPS.map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-12 font-medium text-fg-2">
                  {index + 1}
                </span>
                <p className="text-13 leading-relaxed text-fg-2">{step}</p>
              </li>
            ))}
          </ol>

          <div className="mt-8 rounded-lg border border-line bg-surface p-4">
            <p className="flex items-center gap-2 text-13 font-medium text-fg">
              <Check className="h-4 w-4 text-positive" aria-hidden="true" />
              Работает без ключа API
            </p>
            <p className="mt-1.5 text-12 leading-relaxed text-fg-2">
              Если внешняя модель не настроена, используется встроенный офлайн-движок: вопросы из банка и
              эвристические оценки. Весь функционал тренажёра доступен.
            </p>
          </div>
        </div>
      </aside>
    </div>
  )
}

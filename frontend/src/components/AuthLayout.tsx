import type { ReactNode } from 'react'
import { BrainCircuit, LineChart, MessagesSquare, Sparkles } from 'lucide-react'

import { Brand } from '@/components/Brand'

const FEATURES = [
  {
    icon: BrainCircuit,
    title: 'ИИ-собеседование',
    text: 'Живые вопросы по вашему направлению и уровню, оценка по четырём критериям.',
  },
  {
    icon: MessagesSquare,
    title: 'Чат по теории',
    text: 'Разбор любой темы в диалоге: ассистент отвечает потоком, как настоящий ментор.',
  },
  {
    icon: LineChart,
    title: 'Прогресс и слабые темы',
    text: 'Динамика баллов, сильные и слабые темы, рекомендации к следующему шагу.',
  },
]

interface AuthLayoutProps {
  title: string
  subtitle: string
  children: ReactNode
  footer: ReactNode
}

/** Раскладка страниц входа и регистрации: бренд-панель + форма. */
export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen">
      <aside className="relative hidden w-1/2 flex-col justify-between overflow-hidden border-r border-white/10 bg-ink-900/40 p-10 lg:flex xl:w-[55%]">
        <div className="absolute inset-0 bg-grid opacity-70" aria-hidden="true" />
        <div className="relative">
          <Brand />
        </div>

        <div className="relative max-w-lg">
          <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-accent-400/25 bg-accent-500/10 px-3 py-1 text-xs font-medium text-accent-200">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Интеллектуальная подготовка
          </span>
          <h2 className="text-3xl font-semibold leading-tight text-slate-50 xl:text-4xl">
            Готовьтесь к собеседованиям <span className="text-gradient">с ИИ-наставником</span>
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-slate-400">
            Тренируйтесь на реальных вопросах, получайте разбор каждого ответа и следите за прогрессом — от
            технической теории до задач с кодом.
          </p>

          <ul className="mt-8 space-y-4">
            {FEATURES.map((feature) => {
              const Icon = feature.icon
              return (
                <li key={feature.title} className="flex gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-accent-300">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-slate-200">{feature.title}</p>
                    <p className="text-xs leading-relaxed text-slate-500">{feature.text}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>

        <p className="relative text-xs text-slate-600">© 2026 Тренажёр собеседований</p>
      </aside>

      <main className="flex w-full flex-col justify-center px-5 py-10 sm:px-10 lg:w-1/2 xl:w-[45%]">
        <div className="mx-auto w-full max-w-md animate-fade-up">
          <div className="mb-8 lg:hidden">
            <Brand />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50">{title}</h1>
          <p className="mt-2 text-sm text-slate-400">{subtitle}</p>
          <div className="mt-7">{children}</div>
          <div className="mt-6 text-sm text-slate-400">{footer}</div>
        </div>
      </main>
    </div>
  )
}

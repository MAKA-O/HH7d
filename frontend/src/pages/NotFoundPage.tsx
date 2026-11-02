import { ArrowLeft, Compass } from 'lucide-react'
import { Link } from 'react-router-dom'

/** Страница 404 для несуществующих маршрутов. */
export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-accent-300">
        <Compass className="h-7 w-7" aria-hidden="true" />
      </div>
      <p className="text-6xl font-semibold tracking-tight text-gradient">404</p>
      <h1 className="mt-2 text-xl font-semibold text-slate-100">Страница не найдена</h1>
      <p className="mt-2 max-w-md text-sm text-slate-400">
        Возможно, ссылка устарела или в адресе опечатка. Вернитесь на дашборд и продолжите подготовку.
      </p>
      <Link
        to="/"
        className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-accent-500 to-violet-500 px-5 text-sm font-medium text-white transition hover:from-accent-400 hover:to-violet-400"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        На дашборд
      </Link>
    </div>
  )
}

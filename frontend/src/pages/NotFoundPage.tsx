import { ArrowLeft, Compass } from 'lucide-react'
import { Link } from 'react-router-dom'

/** Страница 404 для несуществующих маршрутов. */
export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-line bg-surface text-fg-3">
        <Compass className="h-6 w-6" aria-hidden="true" />
      </div>
      <p className="text-30 font-semibold tracking-tight text-fg">404</p>
      <h1 className="mt-2 text-20 font-semibold text-fg">Страница не найдена</h1>
      <p className="mt-2 max-w-md text-13 leading-relaxed text-fg-2">
        Возможно, ссылка устарела или в адресе опечатка. Вернитесь на дашборд и продолжите подготовку.
      </p>
      <Link
        to="/"
        className="mt-6 inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-14 font-medium text-accent-fg transition-colors hover:bg-accent-hover"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        На дашборд
      </Link>
    </div>
  )
}

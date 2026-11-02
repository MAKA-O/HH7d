import { FileText, Loader2, MessageSquare, Search, X } from 'lucide-react'
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { useNavigate } from 'react-router-dom'

import { IconButton } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { formatDate, formatRelativeDate } from '@/lib/format'
import { LEVEL_LABELS, ROLE_SHORT_LABELS, STATUS_LABELS, labelOf } from '@/lib/labels'
import type { ConversationOut, SessionSummary } from '@/lib/types'

const CACHE_MS = 60_000

interface SearchEntry {
  key: string
  kind: 'session' | 'conversation'
  title: string
  subtitle: string
  href: string
  state?: { conversationId: number }
}

function buildEntries(
  sessions: SessionSummary[],
  conversations: ConversationOut[],
  query: string,
): SearchEntry[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return []

  const sessionEntries: SearchEntry[] = sessions
    .filter((session) => {
      const haystack = [
        `#${session.id}`,
        String(session.id),
        session.role,
        labelOf(ROLE_SHORT_LABELS, session.role),
        session.level,
        labelOf(LEVEL_LABELS, session.level),
        session.status,
        labelOf(STATUS_LABELS, session.status),
        session.mode,
        formatDate(session.started_at),
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(needle)
    })
    .slice(0, 5)
    .map((session) => ({
      key: `session-${session.id}`,
      kind: 'session' as const,
      title: `Сессия #${session.id}`,
      subtitle: `${labelOf(ROLE_SHORT_LABELS, session.role)} · ${labelOf(LEVEL_LABELS, session.level)} · ${labelOf(STATUS_LABELS, session.status)} · ${formatDate(session.started_at)}`,
      href: session.status === 'completed' ? `/interview/${session.id}/report` : `/interview/${session.id}`,
    }))

  const conversationEntries: SearchEntry[] = conversations
    .filter((conversation) => (conversation.title || 'Новый диалог').toLowerCase().includes(needle))
    .slice(0, 4)
    .map((conversation) => ({
      key: `conversation-${conversation.id}`,
      kind: 'conversation' as const,
      title: conversation.title || 'Новый диалог',
      subtitle: `${conversation.message_count} сообщений · ${formatRelativeDate(conversation.updated_at)}`,
      href: '/chat',
      state: { conversationId: conversation.id },
    }))

  return [...sessionEntries, ...conversationEntries]
}

function Highlight({ text, query }: { text: string; query: string }) {
  const needle = query.trim()
  if (!needle) return <>{text}</>
  const index = text.toLowerCase().indexOf(needle.toLowerCase())
  if (index < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, index)}
      <mark className="search-mark">{text.slice(index, index + needle.length)}</mark>
      {text.slice(index + needle.length)}
    </>
  )
}

interface SearchResultsProps {
  entries: SearchEntry[]
  activeIndex: number
  query: string
  loading: boolean
  error: string | null
  onPick: (entry: SearchEntry) => void
  onHover: (index: number) => void
  idPrefix: string
  className?: string
}

function SearchResults({
  entries,
  activeIndex,
  query,
  loading,
  error,
  onPick,
  onHover,
  idPrefix,
  className,
}: SearchResultsProps) {
  if (loading) {
    return (
      <div className={cn('flex items-center gap-2 px-3 py-4 text-13 text-fg-2', className)}>
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Ищем по сессиям и диалогам…
      </div>
    )
  }
  if (error) {
    return <p className={cn('px-3 py-4 text-13 text-negative', className)}>{error}</p>
  }
  if (!query.trim()) {
    return (
      <p className={cn('px-3 py-3 text-13 leading-relaxed text-fg-3', className)}>
        Введите номер сессии, направление или название диалога. Открывается по Ctrl+K.
      </p>
    )
  }
  if (entries.length === 0) {
    return (
      <p className={cn('px-3 py-3 text-13 text-fg-2', className)}>
        Ничего не найдено. Попробуйте «PostgreSQL», «backend» или номер сессии.
      </p>
    )
  }

  return (
    <div
      role="listbox"
      id={`${idPrefix}-results`}
      aria-label="Результаты поиска"
      className={cn('max-h-80 overflow-y-auto p-1', className)}
    >
      {entries.map((entry, index) => {
        const active = index === activeIndex
        const showGroup = index === 0 || entries[index - 1].kind !== entry.kind
        return (
          <Fragment key={entry.key}>
            {showGroup ? (
              <p className="px-2.5 pb-1 pt-2 text-12 font-medium uppercase tracking-wide text-fg-3">
                {entry.kind === 'session' ? 'Сессии' : 'Диалоги'}
              </p>
            ) : null}
            <button
              type="button"
              role="option"
              id={`${idPrefix}-option-${index}`}
              aria-selected={active}
              onMouseEnter={() => onHover(index)}
              onClick={() => onPick(entry)}
              className={cn(
                'flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors',
                active ? 'bg-surface-2' : 'hover:bg-surface-2',
              )}
            >
              <span className="mt-0.5 shrink-0 text-fg-3">
                {entry.kind === 'session' ? (
                  <FileText className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <MessageSquare className="h-4 w-4" aria-hidden="true" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-13 text-fg">
                  <Highlight text={entry.title} query={query} />
                </span>
                <span className="block truncate text-12 text-fg-3">{entry.subtitle}</span>
              </span>
            </button>
          </Fragment>
        )
      })}
    </div>
  )
}

/** Глобальный поиск: автокомплит по сессиям и диалогам, клавиатурная навигация. */
export function GlobalSearch() {
  const navigate = useNavigate()

  const [query, setQuery] = useState('')
  const [desktopOpen, setDesktopOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [conversations, setConversations] = useState<ConversationOut[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loadedAtRef = useRef(0)

  const desktopInputRef = useRef<HTMLInputElement>(null)
  const desktopWrapperRef = useRef<HTMLDivElement>(null)

  const active = desktopOpen || mobileOpen

  useEffect(() => {
    if (!active) return
    if (loadedAtRef.current && Date.now() - loadedAtRef.current < CACHE_MS) return
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([api.interviews.list(20, 0), api.chat.conversations()])
      .then(([sessionList, conversationList]) => {
        if (cancelled) return
        setSessions(sessionList.items)
        setConversations(conversationList.items)
        loadedAtRef.current = Date.now()
      })
      .catch((caught: unknown) => {
        if (cancelled) return
        setError(caught instanceof Error && caught.message ? caught.message : 'Не удалось загрузить данные поиска.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [active])

  const entries = useMemo(() => buildEntries(sessions, conversations, query), [conversations, query, sessions])

  useEffect(() => {
    setActiveIndex(0)
  }, [query, entries.length])

  // Ctrl/Cmd+K
  useEffect(() => {
    const handleGlobalKey = (event: globalThis.KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return
      event.preventDefault()
      if (window.innerWidth >= 768) {
        setDesktopOpen(true)
        requestAnimationFrame(() => desktopInputRef.current?.focus())
      } else {
        setMobileOpen(true)
      }
    }
    window.addEventListener('keydown', handleGlobalKey)
    return () => window.removeEventListener('keydown', handleGlobalKey)
  }, [])

  // Клик вне десктопного поиска закрывает результаты
  useEffect(() => {
    if (!desktopOpen) return
    const handlePointerDown = (event: MouseEvent) => {
      if (desktopWrapperRef.current && !desktopWrapperRef.current.contains(event.target as Node)) {
        setDesktopOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [desktopOpen])

  const closeAll = () => {
    setDesktopOpen(false)
    setMobileOpen(false)
  }

  const pick = (entry: SearchEntry) => {
    navigate(entry.href, entry.state ? { state: entry.state } : undefined)
    closeAll()
    setQuery('')
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => (entries.length === 0 ? 0 : Math.min(index + 1, entries.length - 1)))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(index - 1, 0))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const entry = entries[activeIndex]
      if (entry) pick(entry)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      closeAll()
      desktopInputRef.current?.blur()
    }
  }

  const comboboxProps = {
    role: 'combobox' as const,
    'aria-expanded': true,
    'aria-autocomplete': 'list' as const,
    'aria-controls': 'global-search-results',
  }

  return (
    <>
      {/* Десктоп */}
      <div ref={desktopWrapperRef} className="relative hidden md:block">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-3"
            aria-hidden="true"
          />
          <input
            ref={desktopInputRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => setDesktopOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder="Поиск по сессиям и чатам…"
            aria-label="Глобальный поиск"
            {...comboboxProps}
            aria-activedescendant={entries.length > 0 ? `global-search-option-${activeIndex}` : undefined}
            className="control h-10 w-64 pl-9 pr-12 text-13"
          />
          <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-line bg-surface-2 px-1.5 py-0.5 text-12 text-fg-3">
            ⌘K
          </kbd>
        </div>

        {desktopOpen ? (
          <div className="absolute left-0 top-full z-50 mt-2 w-[380px] overflow-hidden rounded-lg border border-line bg-surface shadow-pop">
            <SearchResults
              entries={entries}
              activeIndex={activeIndex}
              query={query}
              loading={loading}
              error={error}
              onPick={pick}
              onHover={setActiveIndex}
              idPrefix="global-search"
            />
          </div>
        ) : null}
      </div>

      {/* Мобильный триггер */}
      <IconButton label="Поиск" className="md:hidden" onClick={() => setMobileOpen(true)}>
        <Search className="h-[18px] w-[18px]" aria-hidden="true" />
      </IconButton>

      {/* Мобильный оверлей */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-[80] flex flex-col bg-canvas md:hidden">
          <div className="border-b border-line bg-surface p-3">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-3"
                aria-hidden="true"
              />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Поиск по сессиям и чатам…"
                aria-label="Глобальный поиск"
                {...comboboxProps}
                aria-controls="mobile-search-results"
                aria-activedescendant={entries.length > 0 ? `mobile-search-option-${activeIndex}` : undefined}
                className="control h-11 w-full pl-9 pr-11 text-14"
              />
              <button
                type="button"
                onClick={closeAll}
                aria-label="Закрыть поиск"
                className="absolute right-1 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md text-fg-3 transition-colors hover:bg-surface-2 hover:text-fg"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
          <SearchResults
            entries={entries}
            activeIndex={activeIndex}
            query={query}
            loading={loading}
            error={error}
            onPick={pick}
            onHover={setActiveIndex}
            idPrefix="mobile-search"
            className="flex-1 overflow-y-auto"
          />
        </div>
      ) : null}
    </>
  )
}

import {
  ArrowLeft,
  Lightbulb,
  MessageSquare,
  Plus,
  Send,
  Sparkles,
  Square,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'

import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { RichText } from '@/components/ui/RichText'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/context/ToastContext'
import { ApiError, api, streamChatMessage } from '@/lib/api'
import { cn } from '@/lib/cn'
import { formatRelativeDate, formatTime } from '@/lib/format'
import type { ChatMessageOut, ConversationOut } from '@/lib/types'

const SUGGESTIONS = [
  'Объясни разницу между процессом и потоком',
  'Что такое индекс в базе данных и когда он вредит?',
  'Как работает JWT и где хранить токен?',
  'Чем ACID отличается от BASE?',
]

export function ChatPage() {
  const toast = useToast()

  const [conversations, setConversations] = useState<ConversationOut[]>([])
  const [conversationsLoading, setConversationsLoading] = useState(true)
  const [conversationsError, setConversationsError] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [messages, setMessages] = useState<ChatMessageOut[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [messagesError, setMessagesError] = useState<string | null>(null)

  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [creating, setCreating] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ConversationOut | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list')

  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const selectedIdRef = useRef<number | null>(null)

  useEffect(() => {
    selectedIdRef.current = selectedId
  }, [selectedId])

  // Список диалогов
  const loadConversations = useCallback(async () => {
    setConversationsLoading(true)
    setConversationsError(null)
    try {
      const data = await api.chat.conversations()
      setConversations(data.items)
      setSelectedId((current) => current ?? data.items[0]?.id ?? null)
    } catch (caught) {
      setConversationsError(
        caught instanceof Error && caught.message ? caught.message : 'Не удалось загрузить диалоги.',
      )
    } finally {
      setConversationsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadConversations()
  }, [loadConversations])

  // Сообщения выбранного диалога
  useEffect(() => {
    if (selectedId == null) {
      setMessages([])
      return
    }
    let cancelled = false
    setMessagesLoading(true)
    setMessagesError(null)
    setStreamingText('')
    api.chat
      .messages(selectedId)
      .then((data) => {
        if (!cancelled) setMessages(data.items)
      })
      .catch((caught) => {
        if (cancelled) return
        setMessagesError(caught instanceof Error && caught.message ? caught.message : 'Не удалось загрузить сообщения.')
      })
      .finally(() => {
        if (!cancelled) setMessagesLoading(false)
      })
    return () => {
      cancelled = true
      // Переключение диалога во время стриминга: прерываем поток, чтобы не смешать ответы.
      abortRef.current?.abort()
    }
  }, [selectedId])

  // Прерываем поток при размонтировании
  useEffect(
    () => () => {
      abortRef.current?.abort()
    },
    [],
  )

  // Автопрокрутка вниз
  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [messages, streamingText, streaming])

  const selectedConversation = conversations.find((item) => item.id === selectedId) ?? null

  const refreshAfterTurn = useCallback(async (conversationId: number, partial: string) => {
    try {
      const data = await api.chat.messages(conversationId)
      // Пользователь мог переключиться на другой диалог, пока шёл ответ.
      if (selectedIdRef.current !== conversationId) return
      setMessages(data.items)
      const list = await api.chat.conversations()
      if (selectedIdRef.current !== conversationId) return
      setConversations(list.items)
    } catch {
      if (selectedIdRef.current !== conversationId) return
      if (partial.trim()) {
        setMessages((previous) => [
          ...previous,
          {
            id: -Date.now(),
            role: 'assistant',
            content: partial,
            created_at: new Date().toISOString(),
          },
        ])
      }
    }
  }, [])

  const handleSend = async () => {
    const content = input.trim()
    if (!content || streaming || selectedId == null) return

    setInput('')
    setMessages((previous) => [
      ...previous,
      { id: -Date.now(), role: 'user', content, created_at: new Date().toISOString() },
    ])
    setStreaming(true)
    setStreamingText('')

    const controller = new AbortController()
    abortRef.current = controller
    let accumulated = ''

    try {
      await streamChatMessage(
        selectedId,
        content,
        {
          onDelta: (delta) => {
            accumulated += delta
            setStreamingText((previous) => previous + delta)
          },
          onError: (message) => {
            toast.error(message)
          },
        },
        controller.signal,
      )
    } catch (caught) {
      const aborted = caught instanceof DOMException && caught.name === 'AbortError'
      if (!aborted) {
        toast.error(
          caught instanceof ApiError ? caught.detail : 'Не удалось получить ответ. Проверьте соединение и попробуйте снова.',
        )
      }
    } finally {
      setStreaming(false)
      setStreamingText('')
      abortRef.current = null
      await refreshAfterTurn(selectedId, accumulated)
      inputRef.current?.focus()
    }
  }

  const handleStop = () => {
    abortRef.current?.abort()
  }

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    void handleSend()
  }

  const handleCreateConversation = async () => {
    if (creating) return
    setCreating(true)
    try {
      const conversation = await api.chat.createConversation()
      setConversations((previous) => [conversation, ...previous])
      setSelectedId(conversation.id)
      setMobileView('chat')
      setInput('')
      toast.success('Диалог создан — задайте первый вопрос')
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.detail : 'Не удалось создать диалог.')
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteConversation = async () => {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    try {
      const targetId = deleteTarget.id
      await api.chat.removeConversation(targetId)
      const remaining = conversations.filter((item) => item.id !== targetId)
      setConversations(remaining)
      if (selectedId === targetId) setSelectedId(remaining[0]?.id ?? null)
      setDeleteTarget(null)
      setMobileView('list')
      toast.success('Диалог удалён')
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.detail : 'Не удалось удалить диалог.')
    } finally {
      setDeleting(false)
    }
  }

  const handleSelect = (conversation: ConversationOut) => {
    setSelectedId(conversation.id)
    setMobileView('chat')
  }

  const handleSuggestion = (suggestion: string) => {
    setInput(suggestion)
    inputRef.current?.focus()
  }

  return (
    <div>
      <PageHeader
        eyebrow="Чат"
        title="Чат по теории"
        description="Разберите любую тему в диалоге: ассистент отвечает потоком и опирается на контекст беседы."
        actions={
          <Button onClick={() => void handleCreateConversation()} loading={creating} leftIcon={<Plus className="h-4 w-4" />}>
            Новый диалог
          </Button>
        }
      />

      <Card className="!p-0 overflow-hidden">
        <div className="flex h-[calc(100vh-19rem)] min-h-[520px] lg:h-[calc(100vh-14rem)]">
          {/* Список диалогов */}
          <aside
            className={cn(
              'w-full flex-col border-r border-white/10 lg:flex lg:w-72',
              mobileView === 'list' ? 'flex' : 'hidden',
            )}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Диалоги</p>
              <Badge>{conversations.length}</Badge>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {conversationsLoading ? (
                <div className="space-y-2 p-1">
                  <Skeleton className="h-14 w-full rounded-xl" />
                  <Skeleton className="h-14 w-full rounded-xl" />
                  <Skeleton className="h-14 w-full rounded-xl" />
                </div>
              ) : conversationsError ? (
                <div className="p-2">
                  <p className="text-xs text-rose-300">{conversationsError}</p>
                  <Button variant="secondary" size="sm" className="mt-2" onClick={() => void loadConversations()}>
                    Повторить
                  </Button>
                </div>
              ) : conversations.length === 0 ? (
                <EmptyState
                  compact
                  icon={MessageSquare}
                  title="Диалогов пока нет"
                  description="Создайте первый — и спросите о любой теме."
                  action={
                    <Button size="sm" onClick={() => void handleCreateConversation()} loading={creating} leftIcon={<Plus className="h-3.5 w-3.5" />}>
                      Создать
                    </Button>
                  }
                />
              ) : (
                <div className="space-y-1.5">
                  {conversations.map((conversation) => {
                    const active = conversation.id === selectedId
                    return (
                      <div
                        key={conversation.id}
                        className={cn(
                          'group flex items-center gap-1 rounded-xl border transition',
                          active
                            ? 'border-accent-400/40 bg-accent-500/10'
                            : 'border-transparent hover:border-white/10 hover:bg-white/[0.03]',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => handleSelect(conversation)}
                          className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2.5 text-left"
                        >
                          <span
                            className={cn(
                              'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                              active ? 'bg-accent-500/20 text-accent-200' : 'bg-white/5 text-slate-500',
                            )}
                          >
                            <MessageSquare className="h-4 w-4" aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={cn('block truncate text-sm', active ? 'text-accent-50' : 'text-slate-200')}>
                              {conversation.title || 'Новый диалог'}
                            </span>
                            <span className="block text-[11px] text-slate-500">
                              {conversation.message_count} сообщ. · {formatRelativeDate(conversation.updated_at)}
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(conversation)}
                          aria-label="Удалить диалог"
                          title="Удалить диалог"
                          className="mr-1 rounded-lg p-1.5 text-slate-600 opacity-0 transition hover:bg-rose-500/10 hover:text-rose-300 focus:opacity-100 group-hover:opacity-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </aside>

          {/* Область чата */}
          <section
            className={cn(
              'min-w-0 flex-1 flex-col lg:flex',
              mobileView === 'chat' ? 'flex' : 'hidden',
            )}
          >
            {/* Шапка диалога */}
            <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5">
              <Button
                variant="ghost"
                size="sm"
                className="lg:hidden"
                onClick={() => setMobileView('list')}
                aria-label="К списку диалогов"
                leftIcon={<ArrowLeft className="h-4 w-4" />}
              >
                Диалоги
              </Button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-100">
                  {selectedConversation?.title || 'Новый диалог'}
                </p>
                <p className="text-[11px] text-slate-500">
                  {selectedConversation
                    ? `${selectedConversation.message_count} сообщений · обновлён ${formatRelativeDate(selectedConversation.updated_at)}`
                    : 'Ассистент по теории'}
                </p>
              </div>
              {selectedConversation ? (
                <button
                  type="button"
                  onClick={() => setDeleteTarget(selectedConversation)}
                  aria-label="Удалить диалог"
                  title="Удалить диалог"
                  className="rounded-lg p-2 text-slate-500 transition hover:bg-rose-500/10 hover:text-rose-300"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>

            {/* Сообщения */}
            <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-3 py-4 sm:px-4">
              {selectedId == null ? (
                <div className="flex h-full items-center justify-center">
                  <EmptyState
                    icon={MessageSquare}
                    title="Выберите диалог"
                    description="Или создайте новый — ассистент поможет разобраться в теории."
                    action={
                      <Button size="sm" onClick={() => void handleCreateConversation()} loading={creating} leftIcon={<Plus className="h-3.5 w-3.5" />}>
                        Новый диалог
                      </Button>
                    }
                  />
                </div>
              ) : messagesLoading ? (
                <div className="space-y-4">
                  <Skeleton className="ml-auto h-14 w-2/3 rounded-2xl" />
                  <Skeleton className="h-24 w-3/4 rounded-2xl" />
                </div>
              ) : messagesError ? (
                <div className="flex items-center gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3.5 py-3 text-sm text-rose-200">
                  {messagesError}
                </div>
              ) : messages.length === 0 && !streaming ? (
                <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center text-center">
                  <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-accent-400/25 bg-accent-500/10 text-accent-300">
                    <Sparkles className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <p className="text-base font-medium text-slate-100">О чём поговорим?</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Задайте вопрос по теории — ассистент объяснит по шагам и приведёт примеры.
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => handleSuggestion(suggestion)}
                        className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-left text-xs text-slate-300 transition hover:border-accent-400/30 hover:bg-accent-500/10 hover:text-accent-100"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {messages.map((message) => (
                    <ChatBubble key={message.id} message={message} />
                  ))}
                  {streaming ? <StreamingBubble text={streamingText} /> : null}
                </>
              )}
            </div>

            {/* Ввод */}
            <div className="border-t border-white/10 p-3">
              <div className="flex items-end gap-2">
                <Textarea
                  ref={inputRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  placeholder={selectedId == null ? 'Сначала создайте диалог' : 'Спросите что угодно по теории…'}
                  disabled={selectedId == null || streaming}
                  maxLength={8000}
                  rows={2}
                  className="!min-h-[54px] !resize-none"
                  aria-label="Сообщение"
                />
                {streaming ? (
                  <Button variant="danger" onClick={handleStop} leftIcon={<Square className="h-4 w-4" />}>
                    Стоп
                  </Button>
                ) : (
                  <Button
                    onClick={() => void handleSend()}
                    disabled={!input.trim() || selectedId == null}
                    leftIcon={<Send className="h-4 w-4" />}
                  >
                    Отправить
                  </Button>
                )}
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-600">
                <Lightbulb className="h-3 w-3" aria-hidden="true" />
                Enter — отправить, Shift+Enter — новая строка. ИИ может ошибаться: проверяйте ключевые факты.
              </p>
            </div>
          </section>
        </div>
      </Card>

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Удалить диалог?"
        description={deleteTarget ? `«${deleteTarget.title || 'Новый диалог'}» и вся переписка будут удалены безвозвратно.` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Отмена
            </Button>
            <Button variant="danger" onClick={() => void handleDeleteConversation()} loading={deleting} leftIcon={<Trash2 className="h-4 w-4" />}>
              Удалить
            </Button>
          </>
        }
      />
    </div>
  )
}

function AssistantAvatar() {
  return (
    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent-500 to-violet-500">
      <Sparkles className="h-4 w-4 text-white" aria-hidden="true" />
    </span>
  )
}

function ChatBubble({ message }: { message: ChatMessageOut }) {
  if (message.role === 'system') {
    return <p className="text-center text-xs text-slate-600">{message.content}</p>
  }
  const isUser = message.role === 'user'
  return (
    <div className={cn('flex gap-2.5', isUser && 'flex-row-reverse')}>
      {isUser ? (
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[11px] font-semibold text-slate-300">
          Вы
        </span>
      ) : (
        <AssistantAvatar />
      )}
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-3.5 py-2.5',
          isUser
            ? 'rounded-tr-sm border border-accent-400/25 bg-accent-600/20'
            : 'rounded-tl-sm border border-white/10 bg-white/[0.04]',
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-100">{message.content}</p>
        ) : (
          <RichText text={message.content} />
        )}
        <p className="mt-1.5 text-right text-[10px] tabular-nums text-slate-500">{formatTime(message.created_at)}</p>
      </div>
    </div>
  )
}

function StreamingBubble({ text }: { text: string }) {
  return (
    <div className="flex gap-2.5">
      <AssistantAvatar />
      <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-white/10 bg-white/[0.04] px-3.5 py-2.5">
        {text ? (
          <RichText text={text} className="[&>p:last-child]:after:ml-0.5 [&>p:last-child]:after:inline-block [&>p:last-child]:after:h-4 [&>p:last-child]:after:w-1.5 [&>p:last-child]:after:animate-pulse-soft [&>p:last-child]:after:bg-accent-300 [&>p:last-child]:after:align-middle [&>p:last-child]:after:content-['']" />
        ) : (
          <div className="flex items-center gap-1 py-1.5" aria-label="Ассистент печатает">
            {[0, 1, 2].map((index) => (
              <span
                key={index}
                className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-typing-bounce"
                style={{ animationDelay: `${index * 0.15}s` }}
              />
            ))}
            <span className="ml-1 text-[11px] text-slate-500">печатает…</span>
          </div>
        )}
      </div>
    </div>
  )
}

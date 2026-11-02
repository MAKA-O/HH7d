import {
  ArrowLeft,
  Bot,
  Lightbulb,
  MessageSquare,
  Plus,
  Send,
  Sparkles,
  Square,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useLocation } from 'react-router-dom'

import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button, IconButton } from '@/components/ui/Button'
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
  'Что такое индекс в PostgreSQL и когда он вредит?',
  'Как работает JWT и где безопасно хранить токен?',
  'Чем ACID отличается от BASE?',
]

export function ChatPage() {
  const toast = useToast()
  const location = useLocation()

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

  // Переход из глобального поиска: сразу открываем нужный диалог
  useEffect(() => {
    const state = location.state as { conversationId?: number } | null
    if (state?.conversationId != null) {
      setSelectedId(state.conversationId)
      setMobileView('chat')
    }
  }, [location.state])

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
        setMessagesError(
          caught instanceof Error && caught.message ? caught.message : 'Не удалось загрузить сообщения.',
        )
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
          caught instanceof ApiError
            ? caught.detail
            : 'Не удалось получить ответ. Проверьте соединение и попробуйте снова.',
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
      toast.success('Диалог создан')
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
        title="Чат по теории"
        description="Разберите любую тему в диалоге: ассистент отвечает потоком и учитывает контекст беседы."
        actions={
          <Button onClick={() => void handleCreateConversation()} loading={creating} leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}>
            Новый диалог
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex h-[calc(100vh-17rem)] min-h-[520px] lg:h-[calc(100vh-15rem)]">
          {/* Список диалогов */}
          <aside
            className={cn(
              'w-full flex-col border-r border-line lg:flex lg:w-[280px]',
              mobileView === 'list' ? 'flex' : 'hidden',
            )}
          >
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
              <p className="text-13 font-semibold text-fg">Диалоги</p>
              <Badge>{conversations.length}</Badge>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {conversationsLoading ? (
                <div className="space-y-1.5">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : conversationsError ? (
                <div className="p-2">
                  <p className="text-12 text-negative">{conversationsError}</p>
                  <Button variant="secondary" size="sm" className="mt-2" onClick={() => void loadConversations()}>
                    Повторить
                  </Button>
                </div>
              ) : conversations.length === 0 ? (
                <EmptyState
                  compact
                  icon={MessageSquare}
                  title="Диалогов пока нет"
                  description="Создайте первый и задайте вопрос по теории."
                  action={
                    <Button size="sm" onClick={() => void handleCreateConversation()} loading={creating} leftIcon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}>
                      Создать
                    </Button>
                  }
                />
              ) : (
                <div className="space-y-0.5">
                  {conversations.map((conversation) => {
                    const active = conversation.id === selectedId
                    return (
                      <div
                        key={conversation.id}
                        className={cn(
                          'group flex items-center gap-0.5 rounded-md transition-colors',
                          active ? 'bg-accent-soft' : 'hover:bg-surface-2',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => handleSelect(conversation)}
                          className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 px-2 py-1.5 text-left"
                        >
                          <span
                            className={cn(
                              'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border',
                              active ? 'border-accent/25 bg-surface text-accent' : 'border-line bg-surface-2 text-fg-3',
                            )}
                          >
                            <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={cn('block truncate text-13', active ? 'font-medium text-accent' : 'text-fg')}>
                              {conversation.title || 'Новый диалог'}
                            </span>
                            <span className="block truncate text-12 text-fg-3">
                              {conversation.message_count} сообщ. · {formatRelativeDate(conversation.updated_at)}
                            </span>
                          </span>
                        </button>
                        <IconButton
                          label={`Удалить диалог «${conversation.title || 'Новый диалог'}»`}
                          variant="danger"
                          onClick={() => setDeleteTarget(conversation)}
                          className="mr-1 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </IconButton>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </aside>

          {/* Область чата */}
          <section className={cn('min-w-0 flex-1 flex-col lg:flex', mobileView === 'chat' ? 'flex' : 'hidden')}>
            <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-3 sm:px-4">
              <Button
                variant="ghost"
                size="sm"
                className="lg:hidden"
                onClick={() => setMobileView('list')}
                aria-label="К списку диалогов"
                leftIcon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />}
              >
                Диалоги
              </Button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-13 font-medium text-fg">{selectedConversation?.title || 'Новый диалог'}</p>
                <p className="truncate text-12 text-fg-3">
                  {selectedConversation
                    ? `${selectedConversation.message_count} сообщений · обновлён ${formatRelativeDate(selectedConversation.updated_at)}`
                    : 'Ассистент по теории'}
                </p>
              </div>
              {selectedConversation ? (
                <IconButton label="Удалить диалог" variant="danger" onClick={() => setDeleteTarget(selectedConversation)}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </IconButton>
              ) : null}
            </div>

            <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-3 py-4 sm:px-4">
              {selectedId == null ? (
                <div className="flex h-full items-center justify-center">
                  <EmptyState
                    icon={MessageSquare}
                    title="Выберите диалог"
                    description="Или создайте новый — ассистент поможет разобраться в теории."
                    action={
                      <Button size="sm" onClick={() => void handleCreateConversation()} loading={creating} leftIcon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}>
                        Новый диалог
                      </Button>
                    }
                  />
                </div>
              ) : messagesLoading ? (
                <div className="space-y-4">
                  <Skeleton className="ml-auto h-12 w-2/3 rounded-lg" />
                  <Skeleton className="h-24 w-3/4 rounded-lg" />
                </div>
              ) : messagesError ? (
                <p className="rounded-md border border-negative/25 bg-negative-soft px-3 py-2.5 text-13 text-negative">
                  {messagesError}
                </p>
              ) : messages.length === 0 && !streaming ? (
                <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center text-center">
                  <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-surface-2 text-fg-3">
                    <Sparkles className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <p className="text-16 font-medium text-fg">О чём поговорим?</p>
                  <p className="mt-1 text-13 text-fg-2">
                    Задайте вопрос по теории — ассистент объяснит по шагам и приведёт примеры.
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => handleSuggestion(suggestion)}
                        className="rounded-full border border-line bg-surface px-3 py-1.5 text-left text-12 text-fg-2 transition-colors hover:border-line-strong hover:bg-surface-2 hover:text-fg"
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

            <div className="border-t border-line p-3">
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
                  className="!min-h-[56px] !resize-none"
                  aria-label="Сообщение"
                />
                {streaming ? (
                  <Button variant="danger" onClick={handleStop} leftIcon={<Square className="h-4 w-4" aria-hidden="true" />}>
                    Стоп
                  </Button>
                ) : (
                  <Button
                    onClick={() => void handleSend()}
                    disabled={!input.trim() || selectedId == null}
                    leftIcon={<Send className="h-4 w-4" aria-hidden="true" />}
                  >
                    Отправить
                  </Button>
                )}
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-12 text-fg-3">
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
        description={
          deleteTarget
            ? `«${deleteTarget.title || 'Новый диалог'}» и вся переписка будут удалены безвозвратно.`
            : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Отмена
            </Button>
            <Button variant="danger" onClick={() => void handleDeleteConversation()} loading={deleting} leftIcon={<Trash2 className="h-4 w-4" aria-hidden="true" />}>
              Удалить
            </Button>
          </>
        }
      />
    </div>
  )
}

function ChatBubble({ message }: { message: ChatMessageOut }) {
  if (message.role === 'system') {
    return <p className="text-center text-12 text-fg-3">{message.content}</p>
  }
  const isUser = message.role === 'user'
  return (
    <div className={cn('flex gap-2.5', isUser && 'flex-row-reverse')}>
      {isUser ? (
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-12 font-medium text-fg-2">
          Вы
        </span>
      ) : (
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-fg-2">
          <Bot className="h-4 w-4" aria-hidden="true" />
        </span>
      )}
      <div
        className={cn(
          'max-w-[85%] rounded-lg border px-3 py-2',
          isUser ? 'border-accent/20 bg-accent-soft' : 'border-line bg-surface',
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap break-words text-13 leading-relaxed text-fg">{message.content}</p>
        ) : (
          <RichText text={message.content} />
        )}
        <p className="mt-1 text-right text-12 tabular-nums text-fg-3">{formatTime(message.created_at)}</p>
      </div>
    </div>
  )
}

function StreamingBubble({ text }: { text: string }) {
  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-fg-2">
        <Bot className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="max-w-[85%] rounded-lg border border-line bg-surface px-3 py-2">
        {text ? (
          <RichText text={text} className="[&>p:last-child]:after:ml-0.5 [&>p:last-child]:after:inline-block [&>p:last-child]:after:h-3.5 [&>p:last-child]:after:w-1 [&>p:last-child]:after:animate-pulse [&>p:last-child]:after:bg-fg-3 [&>p:last-child]:after:align-middle [&>p:last-child]:after:content-['']" />
        ) : (
          <div className="flex items-center gap-1 py-1.5" aria-label="Ассистент печатает">
            {[0, 1, 2].map((index) => (
              <span
                key={index}
                className="h-1.5 w-1.5 animate-bounce rounded-full bg-fg-3"
                style={{ animationDelay: `${index * 0.15}s` }}
              />
            ))}
            <span className="ml-1 text-12 text-fg-3">печатает…</span>
          </div>
        )}
      </div>
    </div>
  )
}

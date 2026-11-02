/**
 * Единый клиент API (docs/API.md).
 *
 * Правила:
 *  - базовый путь `/api`, в dev он проксируется Vite'ом на http://127.0.0.1:8000;
 *  - JWT хранится в localStorage, подставляется заголовком Authorization;
 *  - при 401 токен сбрасывается и вызывается обработчик (разлогин + редирект);
 *  - сообщения об ошибках берутся из поля `detail` (FastAPI), иначе — осмысленный
 *    русский текст по HTTP-коду;
 *  - для чата есть отдельная функция потокового чтения SSE (fetch + ReadableStream).
 */
import type {
  AIHealthOut,
  AnalyticsOut,
  AnswerIn,
  AnswerResult,
  AuthResponse,
  ChatMessageListOut,
  ChatTurnOut,
  CodeReviewListOut,
  CodeReviewOut,
  CodeTaskIn,
  CodeTaskOut,
  ConversationListOut,
  ConversationOut,
  InterviewCreateIn,
  LoginIn,
  MetaOut,
  ProfileIn,
  QuestionOut,
  RegisterIn,
  SessionDetail,
  SessionListOut,
  TranscriptOut,
  UserOut,
} from './types'

const API_BASE = '/api'
const TOKEN_KEY = 'interview_trainer_token'

const NETWORK_ERROR = 'Сервер недоступен. Проверьте, запущен ли backend, и повторите попытку.'

let unauthorizedHandler: (() => void) | null = null

/** Регистрирует реакцию приложения на 401 (разлогин). Вызывается из AuthProvider. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Приватный режим браузера — молча продолжаем без сохранения токена.
  }
}

/** Ошибка API: HTTP-статус + человекочитаемое описание (из `detail`). */
export class ApiError extends Error {
  readonly status: number
  readonly detail: string

  constructor(status: number, detail: string) {
    super(detail)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

function defaultMessage(status: number): string {
  switch (status) {
    case 0:
      return NETWORK_ERROR
    case 400:
      return 'Запрос отклонён: проверьте введённые данные.'
    case 401:
      return 'Требуется вход в систему.'
    case 403:
      return 'Нет доступа к этому объекту.'
    case 404:
      return 'Объект не найден.'
    case 422:
      return 'Проверьте правильность заполнения полей.'
    case 503:
      return 'ИИ-сервис временно недоступен. Попробуйте позже.'
    default:
      return 'Что-то пошло не так. Попробуйте ещё раз.'
  }
}

/** Достаёт текст ошибки из ответа FastAPI (строка или список ошибок валидации). */
function extractDetail(payload: unknown, status: number): string {
  if (typeof payload === 'string' && payload.trim()) return payload.trim()
  if (payload && typeof payload === 'object') {
    const detail = (payload as { detail?: unknown }).detail
    if (typeof detail === 'string' && detail.trim()) return detail.trim()
    if (Array.isArray(detail)) {
      const messages = detail
        .map((item) => {
          if (item && typeof item === 'object') {
            const msg = (item as { msg?: unknown }).msg
            if (typeof msg === 'string' && msg.trim()) return msg.trim()
          }
          return null
        })
        .filter((message): message is string => Boolean(message))
      if (messages.length > 0) return messages.join('; ')
    }
  }
  return defaultMessage(status)
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (init.body !== undefined && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers })
  } catch (error) {
    if (isAbortError(error)) throw error
    throw new ApiError(0, NETWORK_ERROR)
  }

  if (response.status === 401) {
    setToken(null)
    unauthorizedHandler?.()
    throw new ApiError(401, 'Сессия истекла — войдите в систему заново.')
  }

  if (response.status === 204) return undefined as T

  const contentType = response.headers.get('content-type') ?? ''
  let payload: unknown = null
  if (contentType.includes('application/json')) {
    payload = await response.json().catch(() => null)
  } else if (!response.ok) {
    const text = await response.text().catch(() => '')
    payload = text || null
  }

  if (!response.ok) throw new ApiError(response.status, extractDetail(payload, response.status))
  return payload as T
}

function get<T>(path: string): Promise<T> {
  return request<T>(path)
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })
}

function put<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) })
}

function del<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' })
}

/** Типизированные методы API по разделам контракта. */
export const api = {
  auth: {
    register: (body: RegisterIn) => post<AuthResponse>('/auth/register', body),
    login: (body: LoginIn) => post<AuthResponse>('/auth/login', body),
    me: () => get<UserOut>('/auth/me'),
  },

  meta: () => get<MetaOut>('/meta'),

  profile: {
    get: () => get<UserOut>('/profile'),
    update: (body: ProfileIn) => put<UserOut>('/profile', body),
  },

  interviews: {
    list: (limit = 20, offset = 0) => get<SessionListOut>(`/interviews?limit=${limit}&offset=${offset}`),
    get: (id: number) => get<SessionDetail>(`/interviews/${id}`),
    create: (body: InterviewCreateIn) => post<SessionDetail>('/interviews', body),
    remove: (id: number) => del<void>(`/interviews/${id}`),
    submitAnswer: (id: number, body: AnswerIn) => post<AnswerResult>(`/interviews/${id}/answers`, body),
    finish: (id: number) => post<SessionDetail>(`/interviews/${id}/finish`),
    nextQuestion: (id: number) => post<QuestionOut>(`/interviews/${id}/questions/next`),
  },

  analytics: () => get<AnalyticsOut>('/analytics/overview'),

  chat: {
    conversations: () => get<ConversationListOut>('/chat/conversations'),
    createConversation: (title?: string | null) =>
      post<ConversationOut>('/chat/conversations', title ? { title } : {}),
    removeConversation: (id: number) => del<void>(`/chat/conversations/${id}`),
    messages: (id: number) => get<ChatMessageListOut>(`/chat/conversations/${id}/messages`),
    send: (id: number, content: string) =>
      post<ChatTurnOut>(`/chat/conversations/${id}/messages`, { content, stream: false }),
  },

  code: {
    createTask: (body: CodeTaskIn) => post<CodeTaskOut>('/code/tasks', body),
    getTask: (id: number) => get<CodeTaskOut>(`/code/tasks/${id}`),
    review: (id: number, code: string) => post<CodeReviewOut>(`/code/tasks/${id}/review`, { code }),
    history: () => get<CodeReviewListOut>('/code/history'),
  },

  aiHealth: () => get<AIHealthOut>('/ai/health'),

  voice: {
    /** Серверное распознавание речи (запасной путь, если браузер не умеет Web Speech API). */
    transcribe: (file: Blob, filename = 'answer.webm') => {
      const form = new FormData()
      form.append('file', file, filename)
      return request<TranscriptOut>('/voice/transcribe', { method: 'POST', body: form })
    },
  },
}

export interface ChatStreamHandlers {
  /** Пришёл очередной фрагмент ответа ассистента. */
  onDelta?: (delta: string) => void
  /** Поток завершён (пришёл `done` или закрылся). */
  onDone?: (messageId?: number) => void
  /** Сервер прислал событие `{"error": "..."}`. */
  onError?: (message: string) => void
}

/**
 * Отправляет сообщение в чат и читает ответ как SSE-поток
 * (`stream: true`): склеиваем `delta` и отдаём наружу.
 */
export async function streamChatMessage(
  conversationId: number,
  content: string,
  handlers: ChatStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const token = getToken()
  let response: Response
  try {
    response = await fetch(`${API_BASE}/chat/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ content, stream: true }),
      signal,
    })
  } catch (error) {
    if (isAbortError(error)) throw error
    throw new ApiError(0, NETWORK_ERROR)
  }

  if (response.status === 401) {
    setToken(null)
    unauthorizedHandler?.()
    throw new ApiError(401, 'Сессия истекла — войдите в систему заново.')
  }

  if (!response.ok) {
    let detail = ''
    try {
      const payload: unknown = await response.json()
      detail = extractDetail(payload, response.status)
    } catch {
      detail = defaultMessage(response.status)
    }
    throw new ApiError(response.status, detail)
  }

  if (!response.body) {
    throw new ApiError(500, 'Сервер не прислал поток ответа. Попробуйте ещё раз.')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finished = false

  const handleEvent = (rawEvent: string) => {
    const dataLines = rawEvent
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
    if (dataLines.length === 0) return
    const payload = dataLines.join('\n').trim()
    if (!payload) return
    if (payload === '[DONE]') {
      finished = true
      handlers.onDone?.()
      return
    }
    let parsed: { delta?: unknown; done?: unknown; error?: unknown; message_id?: unknown }
    try {
      parsed = JSON.parse(payload) as typeof parsed
    } catch {
      // Неполный JSON в чанке — пропускаем, следующий чанк дополнит текст.
      return
    }
    if (typeof parsed.error === 'string' && parsed.error.trim()) {
      finished = true
      handlers.onError?.(parsed.error)
      return
    }
    if (typeof parsed.delta === 'string') handlers.onDelta?.(parsed.delta)
    if (parsed.done) {
      finished = true
      handlers.onDone?.(typeof parsed.message_id === 'number' ? parsed.message_id : undefined)
    }
  }

  try {
    while (!finished) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let separatorIndex = buffer.search(/\r?\n\r?\n/)
      while (separatorIndex >= 0) {
        const rawEvent = buffer.slice(0, separatorIndex)
        buffer = buffer.slice(separatorIndex).replace(/^\r?\n\r?\n/, '')
        handleEvent(rawEvent)
        if (finished) break
        separatorIndex = buffer.search(/\r?\n\r?\n/)
      }
    }
    // Сервер мог закрыть поток, не прислав финальную пустую строку.
    if (!finished && buffer.trim()) handleEvent(buffer)
  } catch (error) {
    if (isAbortError(error)) throw error
    throw new ApiError(0, 'Соединение с сервером прервалось. Ответ мог сохраниться — обновите страницу.')
  } finally {
    if (finished) {
      await reader.cancel().catch(() => undefined)
    }
    reader.releaseLock()
    if (!finished) handlers.onDone?.()
  }
}

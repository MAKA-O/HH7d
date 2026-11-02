/** Форматирование дат, длительностей и чисел для интерфейса (локаль ru-RU). */

const MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
]

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  // API отдаёт ISO без таймзоны (UTC) — добавляем Z для корректного пересчёта.
  const normalized = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

/** «2 ноября 2026, 14:05» */
export function formatDateTime(value: string | null | undefined): string {
  const date = parseDate(value)
  if (!date) return '—'
  const day = date.getDate()
  const month = MONTHS_GENITIVE[date.getMonth()]
  const year = date.getFullYear()
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${day} ${month} ${year}, ${hours}:${minutes}`
}

/** «2 ноя 2026» */
export function formatDate(value: string | null | undefined): string {
  const date = parseDate(value)
  if (!date) return '—'
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`
}

/** «14:05» */
export function formatTime(value: string | null | undefined): string {
  const date = parseDate(value)
  if (!date) return '—'
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/** Для подписи «сегодня/вчера» в списках. */
export function formatRelativeDate(value: string | null | undefined): string {
  const date = parseDate(value)
  if (!date) return '—'
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / 86_400_000)
  if (diffDays <= 0) return `Сегодня, ${formatTime(value)}`
  if (diffDays === 1) return `Вчера, ${formatTime(value)}`
  if (diffDays < 7) return `${diffDays} дн. назад`
  return formatDate(value)
}

/** Секунды → «2 мин 15 с» (для длительности сессии). */
export function formatDuration(totalSeconds: number | null | undefined): string {
  const seconds = Math.max(0, Math.round(totalSeconds ?? 0))
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (minutes === 0) return `${rest} с`
  if (minutes < 60) return rest === 0 ? `${minutes} мин` : `${minutes} мин ${rest} с`
  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60
  return restMinutes === 0 ? `${hours} ч` : `${hours} ч ${restMinutes} мин`
}

/** Секунды → «02:15» (для таймера вопроса). */
export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

/** Балл 0–10 с одним знаком после запятой (русская запятая). */
export function formatScore(score: number | null | undefined): string {
  if (score == null || Number.isNaN(score)) return '—'
  return score.toFixed(1).replace('.', ',')
}

/** Проценты для прогресс-баров (0–100). */
export function scorePercent(score: number | null | undefined): number {
  if (score == null || Number.isNaN(score)) return 0
  return Math.min(100, Math.max(0, (score / 10) * 100))
}

/** Число с разделителем разрядов: 1 234. */
export function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '0'
  return value.toLocaleString('ru-RU')
}

/** Плюрализация: plural(3, ['сессия', 'сессии', 'сессий']). */
export function plural(count: number, forms: [string, string, string]): string {
  const abs = Math.abs(count) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return forms[2]
  if (last > 1 && last < 5) return forms[1]
  if (last === 1) return forms[0]
  return forms[2]
}

/** Удобная подпись: «5 вопросов». */
export function questionsLabel(count: number): string {
  return `${count} ${plural(count, ['вопрос', 'вопроса', 'вопросов'])}`
}

/** Обрезка длинного текста с многоточием. */
export function truncate(text: string, max = 120): string {
  if (text.length <= max) return text
  return `${text.slice(0, max).trimEnd()}…`
}

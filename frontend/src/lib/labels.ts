/**
 * Справочники для подписей и цветов: коды из API (docs/API.md) → русские названия.
 * Значения из /api/meta имеют приоритет; эти словари — фолбэк и источник оформления.
 */

export const ROLE_LABELS: Record<string, string> = {
  backend: 'Backend-разработчик',
  frontend: 'Frontend-разработчик',
  qa: 'QA-инженер',
  data: 'Data-инженер',
  devops: 'DevOps-инженер',
  general: 'Общая подготовка',
}

export const ROLE_SHORT_LABELS: Record<string, string> = {
  backend: 'Backend',
  frontend: 'Frontend',
  qa: 'QA',
  data: 'Data',
  devops: 'DevOps',
  general: 'Общая',
}

export const LEVEL_LABELS: Record<string, string> = {
  intern: 'Стажёр',
  junior: 'Junior',
  middle: 'Middle',
  senior: 'Senior',
}

export const MODE_LABELS: Record<string, string> = {
  mixed: 'Смешанное собеседование',
  theory: 'Только теория',
  code: 'Только код',
}

export const MODE_SHORT_LABELS: Record<string, string> = {
  mixed: 'Смешанное',
  theory: 'Теория',
  code: 'Код',
}

export const DIFFICULTY_LABELS: Record<string, string> = {
  easy: 'Лёгкий',
  medium: 'Средний',
  hard: 'Сложный',
}

export const QUESTION_TYPE_LABELS: Record<string, string> = {
  theory: 'Теория',
  code: 'Код',
}

export const STATUS_LABELS: Record<string, string> = {
  in_progress: 'В процессе',
  completed: 'Завершена',
}

export const CRITERIA_LABELS: Record<string, string> = {
  correctness: 'Правильность',
  completeness: 'Полнота',
  depth: 'Глубина',
  clarity: 'Ясность',
}

export const CRITERIA_HINTS: Record<string, string> = {
  correctness: 'Фактическая верность ответа',
  completeness: 'Насколько полно раскрыта тема',
  depth: 'Понимание причин и деталей',
  clarity: 'Структура и ясность изложения',
}

export const SEVERITY_LABELS: Record<string, string> = {
  critical: 'Критично',
  major: 'Важно',
  minor: 'Незначительно',
  nit: 'Придирка',
}

export const SEVERITY_ORDER: string[] = ['critical', 'major', 'minor', 'nit']

export interface CodeTitleOption {
  code: string
  title: string
}

export const LANGUAGES: CodeTitleOption[] = [
  { code: 'python', title: 'Python' },
  { code: 'javascript', title: 'JavaScript' },
  { code: 'typescript', title: 'TypeScript' },
  { code: 'java', title: 'Java' },
  { code: 'c++', title: 'C++' },
  { code: 'sql', title: 'SQL' },
]

export const CODE_TOPIC_SUGGESTIONS = [
  'Алгоритмы и структуры данных',
  'SQL и базы данных',
  'Python',
  'JavaScript',
  'REST API',
  'Docker и CI/CD',
  'Тестирование',
  'Системный дизайн',
]

/** Подпись по коду с фолбэком на сам код (чтобы не показывать пустоту). */
export function labelOf(dict: Record<string, string>, code: string | null | undefined, fallback = '—'): string {
  if (!code) return fallback
  return dict[code] ?? code
}

/** Классы бейджа сложности вопроса/задачи. */
export function difficultyClasses(difficulty: string | null | undefined): string {
  switch (difficulty) {
    case 'easy':
      return 'border-positive/25 bg-positive-soft text-positive'
    case 'medium':
      return 'border-caution/25 bg-caution-soft text-caution'
    case 'hard':
      return 'border-negative/25 bg-negative-soft text-negative'
    default:
      return 'border-line bg-surface-2 text-fg-2'
  }
}

/** Тон бейджа статуса сессии. */
export function statusTone(status: string): 'positive' | 'accent' {
  return status === 'completed' ? 'positive' : 'accent'
}

/** Классы бейджа статуса сессии (для мест, где нужен className). */
export function statusClasses(status: string): string {
  return status === 'completed'
    ? 'border-positive/25 bg-positive-soft text-positive'
    : 'border-accent/25 bg-accent-soft text-accent'
}

/** Тон замечания код-ревью. */
export function severityTone(severity: string): 'negative' | 'caution' | 'neutral' {
  switch (severity) {
    case 'critical':
      return 'negative'
    case 'major':
      return 'caution'
    default:
      return 'neutral'
  }
}

/** Классы бейджа severity. */
export function severityClasses(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'border-negative/25 bg-negative-soft text-negative'
    case 'major':
      return 'border-caution/25 bg-caution-soft text-caution'
    default:
      return 'border-line bg-surface-2 text-fg-2'
  }
}

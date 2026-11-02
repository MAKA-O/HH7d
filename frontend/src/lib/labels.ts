/**
 * Справочники для подписей и цветов: коды из API (docs/API.md) → русские названия.
 * Значения, пришедшие из /api/meta, имеют приоритет; эти словари — фолбэк
 * и источник оформления (цвета, иконки, порядок).
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

export const LANGUAGES: CodeTitleOption[] = [
  { code: 'python', title: 'Python' },
  { code: 'javascript', title: 'JavaScript' },
  { code: 'typescript', title: 'TypeScript' },
  { code: 'java', title: 'Java' },
  { code: 'c++', title: 'C++' },
  { code: 'sql', title: 'SQL' },
]

export interface CodeTitleOption {
  code: string
  title: string
}

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

/** Цвета бейджа сложности вопроса/задачи. */
export function difficultyClasses(difficulty: string | null | undefined): string {
  switch (difficulty) {
    case 'easy':
      return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
    case 'medium':
      return 'bg-amber-500/10 text-amber-300 border-amber-500/20'
    case 'hard':
      return 'bg-rose-500/10 text-rose-300 border-rose-500/20'
    default:
      return 'bg-white/5 text-slate-300 border-white/10'
  }
}

/** Цвета бейджа статуса сессии. */
export function statusClasses(status: string): string {
  return status === 'completed'
    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
    : 'bg-sky-500/10 text-sky-300 border-sky-500/20'
}

/** Цвета для severity замечаний код-ревью. */
export function severityClasses(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'bg-rose-500/10 text-rose-300 border-rose-500/25'
    case 'major':
      return 'bg-orange-500/10 text-orange-300 border-orange-500/25'
    case 'minor':
      return 'bg-amber-500/10 text-amber-300 border-amber-500/25'
    case 'nit':
      return 'bg-slate-500/10 text-slate-300 border-slate-500/25'
    default:
      return 'bg-white/5 text-slate-300 border-white/10'
  }
}

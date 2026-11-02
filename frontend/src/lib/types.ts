/**
 * TypeScript-типы под контракт API (docs/API.md, schemas.py).
 * Все коды (role/level/mode/difficulty/...) — строки из справочников,
 * поэтому в интерфейсах они типизированы как string, а подписи берутся из /api/meta.
 */

export type SessionStatus = 'in_progress' | 'completed'
export type ChatRole = 'user' | 'assistant' | 'system'
export type AIHealthMode = 'live' | 'offline'

export interface UserOut {
  id: number
  email: string
  full_name: string
  target_role: string
  target_level: string
  created_at: string
}

export interface AuthResponse {
  access_token: string
  token_type: string
  user: UserOut
}

export interface RegisterIn {
  email: string
  password: string
  full_name: string
}

export interface LoginIn {
  email: string
  password: string
}

export interface ProfileIn {
  full_name?: string
  target_role?: string
  target_level?: string
  resume_text?: string
}

export interface RoleInfo {
  code: string
  title: string
  description: string
  topics: string[]
  levels?: string[]
}

export interface CodeTitle {
  code: string
  title: string
}

export interface MetaOut {
  roles: RoleInfo[]
  levels: CodeTitle[]
  modes: CodeTitle[]
  question_types: CodeTitle[]
  difficulties: CodeTitle[]
}

export interface QuestionOut {
  id: number
  order_index: number
  type: string
  topic: string
  difficulty: string
  text: string
  starter_code: string | null
  language: string | null
}

export interface AnswerOut {
  id: number
  question_id: number
  text: string
  time_spent_sec: number
  created_at: string
}

export interface EvaluationOut {
  id: number
  answer_id: number
  question_id: number
  score: number
  criteria: Record<string, number>
  strengths: string[]
  gaps: string[]
  ideal_answer: string
  recommendation: string
  follow_up_question: string | null
  created_at: string
}

export interface AnswerResult {
  answer: AnswerOut
  evaluation: EvaluationOut
}

export interface SessionSummary {
  id: number
  role: string
  level: string
  mode: string
  status: SessionStatus
  overall_score: number | null
  question_count: number
  answered_count: number
  started_at: string
  finished_at: string | null
  duration_sec: number
}

export interface SessionReport {
  overall_score: number
  verdict: string
  strengths: string[]
  gaps: string[]
  recommendations: string[]
  topic_scores: Record<string, number>
  answered_count: number
  duration_sec: number
}

export interface SessionDetail extends SessionSummary {
  questions: QuestionOut[]
  answers: AnswerResult[]
  report: SessionReport | null
}

export interface SessionListOut {
  items: SessionSummary[]
  total: number
}

export interface InterviewCreateIn {
  role: string
  level: string
  mode: string
  question_count: number
  focus_topics: string[]
}

export interface AnswerIn {
  question_id: number
  text: string
  time_spent_sec: number
}

export interface ConversationOut {
  id: number
  title: string
  created_at: string
  updated_at: string
  message_count: number
}

export interface ChatMessageOut {
  id: number
  role: ChatRole
  content: string
  created_at: string
}

export interface ChatTurnOut {
  user_message: ChatMessageOut
  assistant_message: ChatMessageOut
}

export interface ConversationListOut {
  items: ConversationOut[]
  total: number
}

export interface ChatMessageListOut {
  items: ChatMessageOut[]
}

export interface CodeTaskOut {
  id: number
  topic: string
  language: string
  difficulty: string
  title: string
  description: string
  starter_code: string
  hints: string[]
  created_at: string
}

export interface CodeTaskIn {
  topic?: string | null
  language: string
  difficulty: string
}

export interface CodeIssue {
  severity: string
  title: string
  detail: string
}

export interface CodeReviewOut {
  id: number
  task_id: number | null
  score: number
  verdict: string
  correctness_notes: string
  issues: CodeIssue[]
  improved_code: string
  time_complexity: string | null
  space_complexity: string | null
  created_at: string
}

export interface CodeReviewListOut {
  items: CodeReviewOut[]
  total: number
}

export interface TopicStat {
  topic: string
  avg_score: number
  answers_count: number
}

export interface ScorePoint {
  date: string
  score: number
}

export interface AnalyticsOut {
  sessions_count: number
  completed_sessions: number
  avg_score: number
  best_score: number
  questions_answered: number
  streak_days: number
  weak_topics: TopicStat[]
  strong_topics: TopicStat[]
  topic_stats: TopicStat[]
  difficulty_stats: Record<string, number>
  score_history: ScorePoint[]
  recent_sessions: SessionSummary[]
}

export interface AIHealthOut {
  provider: string
  model: string
  mode: AIHealthMode
  available: boolean
  message: string
}

export interface TranscriptOut {
  text: string
}

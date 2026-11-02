"""Pydantic-схемы API. Замороженный контракт: см. docs/API.md."""
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

RoleCode = str
LevelCode = Literal["intern", "junior", "middle", "senior"]
ModeCode = Literal["mixed", "theory", "code"]
Difficulty = Literal["easy", "medium", "hard"]
QuestionType = Literal["theory", "code"]
SessionStatus = Literal["in_progress", "completed"]


# ---------------------------------------------------------------- аутентификация
class RegisterIn(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=6, max_length=128)
    full_name: str = Field(default="", max_length=255)


class LoginIn(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    full_name: str = ""
    target_role: str = "backend"
    target_level: str = "junior"
    created_at: datetime


class ProfileIn(BaseModel):
    full_name: str | None = Field(default=None, max_length=255)
    target_role: str | None = None
    target_level: LevelCode | None = None
    resume_text: str | None = None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------------------------------------------------------------- справочники
class RoleInfo(BaseModel):
    code: str
    title: str
    description: str
    topics: list[str]
    levels: list[str]


class CodeTitle(BaseModel):
    code: str
    title: str


class MetaOut(BaseModel):
    roles: list[RoleInfo]
    levels: list[CodeTitle]
    modes: list[CodeTitle]
    question_types: list[CodeTitle]
    difficulties: list[CodeTitle]


# ---------------------------------------------------------------- собеседования
class InterviewCreate(BaseModel):
    role: RoleCode = "backend"
    level: LevelCode = "junior"
    mode: ModeCode = "mixed"
    question_count: int = Field(default=5, ge=3, le=15)
    focus_topics: list[str] = Field(default_factory=list)


class QuestionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_index: int
    type: QuestionType
    topic: str
    difficulty: Difficulty
    text: str
    starter_code: str | None = None
    language: str | None = None


class AnswerIn(BaseModel):
    question_id: int
    text: str = Field(min_length=1, max_length=20_000)
    time_spent_sec: int = Field(default=0, ge=0, le=86_400)


class AnswerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    question_id: int
    text: str
    time_spent_sec: int
    created_at: datetime


class EvaluationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    answer_id: int
    question_id: int
    score: float
    criteria: dict[str, float] = Field(default_factory=dict)
    strengths: list[str] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)
    ideal_answer: str = ""
    recommendation: str = ""
    follow_up_question: str | None = None
    created_at: datetime


class AnswerResult(BaseModel):
    answer: AnswerOut
    evaluation: EvaluationOut


class SessionSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    role: str
    level: str
    mode: str
    status: SessionStatus
    overall_score: float | None = None
    question_count: int = 0
    answered_count: int = 0
    started_at: datetime
    finished_at: datetime | None = None
    duration_sec: int = 0


class SessionReport(BaseModel):
    overall_score: float = 0.0
    verdict: str = ""
    strengths: list[str] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    topic_scores: dict[str, float] = Field(default_factory=dict)
    answered_count: int = 0
    duration_sec: int = 0


class SessionDetail(SessionSummary):
    questions: list[QuestionOut] = Field(default_factory=list)
    answers: list[AnswerResult] = Field(default_factory=list)
    report: SessionReport | None = None


class SessionListOut(BaseModel):
    items: list[SessionSummary]
    total: int


# ---------------------------------------------------------------- чат
class ConversationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    created_at: datetime
    updated_at: datetime
    message_count: int = 0


class ConversationCreate(BaseModel):
    title: str | None = Field(default=None, max_length=255)


class ChatMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    role: Literal["user", "assistant", "system"]
    content: str
    created_at: datetime


class ChatSendIn(BaseModel):
    content: str = Field(min_length=1, max_length=8_000)
    stream: bool = False


class ChatTurnOut(BaseModel):
    user_message: ChatMessageOut
    assistant_message: ChatMessageOut


class ConversationListOut(BaseModel):
    items: list[ConversationOut]
    total: int


class ChatMessageListOut(BaseModel):
    items: list[ChatMessageOut]


# ---------------------------------------------------------------- код
class CodeTaskIn(BaseModel):
    topic: str | None = Field(default=None, max_length=120)
    language: Literal["python", "javascript", "typescript", "java", "c++", "sql"] = "python"
    difficulty: Difficulty = "medium"
    user_level: LevelCode | None = None


class CodeTaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    topic: str
    language: str
    difficulty: str
    title: str
    description: str
    starter_code: str = ""
    hints: list[str] = Field(default_factory=list)
    created_at: datetime


class CodeIssue(BaseModel):
    severity: Literal["critical", "major", "minor", "nit"] = "minor"
    title: str
    detail: str = ""


class CodeReviewIn(BaseModel):
    code: str = Field(min_length=1, max_length=40_000)


class CodeReviewOut(BaseModel):
    id: int
    task_id: int | None = None
    score: float = 0.0
    verdict: str = ""
    correctness_notes: str = ""
    issues: list[CodeIssue] = Field(default_factory=list)
    improved_code: str = ""
    time_complexity: str | None = None
    space_complexity: str | None = None
    created_at: datetime


class CodeReviewListOut(BaseModel):
    items: list[CodeReviewOut]
    total: int


# ---------------------------------------------------------------- аналитика
class TopicStat(BaseModel):
    topic: str
    avg_score: float
    answers_count: int


class ScorePoint(BaseModel):
    date: str
    score: float


class AnalyticsOut(BaseModel):
    sessions_count: int = 0
    completed_sessions: int = 0
    avg_score: float = 0.0
    best_score: float = 0.0
    questions_answered: int = 0
    streak_days: int = 0
    weak_topics: list[TopicStat] = Field(default_factory=list)
    strong_topics: list[TopicStat] = Field(default_factory=list)
    topic_stats: list[TopicStat] = Field(default_factory=list)
    difficulty_stats: dict[str, float] = Field(default_factory=dict)
    score_history: list[ScorePoint] = Field(default_factory=list)
    recent_sessions: list[SessionSummary] = Field(default_factory=list)


# ---------------------------------------------------------------- ИИ / голос
class AIHealthOut(BaseModel):
    provider: str
    model: str
    mode: Literal["live", "offline"]
    available: bool
    message: str = ""


class TranscriptOut(BaseModel):
    text: str


class ErrorOut(BaseModel):
    detail: str = ""


class OkOut(BaseModel):
    ok: bool = True
    detail: str = ""


# ---------------------------------------------------------------- общие конверты
class InterviewListOut(BaseModel):
    items: list[SessionSummary]
    total: int


class Paginated(BaseModel):
    items: list[Any]
    total: int

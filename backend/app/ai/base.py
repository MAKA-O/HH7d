"""Контракт ИИ-слоя.

Реализация живёт в app/ai/service.py (класс AIServiceImpl) и провайдерах
(app/ai/providers.py, app/ai/prompts.py, app/ai/offline.py).

Роутеры работают только через get_ai_service() из app.ai.factory, поэтому
замена провайдера не затрагивает API.
"""
from abc import ABC, abstractmethod
from collections.abc import Iterator
from typing import Any, Literal

from pydantic import BaseModel, Field


class GeneratedQuestion(BaseModel):
    text: str
    topic: str = "Общее"
    difficulty: Literal["easy", "medium", "hard"] = "medium"
    type: Literal["theory", "code"] = "theory"
    expected_points: list[str] = Field(default_factory=list)
    starter_code: str | None = None
    language: str | None = None


class EvaluationResult(BaseModel):
    score: float = 0.0
    criteria: dict[str, float] = Field(default_factory=dict)
    strengths: list[str] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)
    ideal_answer: str = ""
    recommendation: str = ""
    follow_up_question: str | None = None


class SessionReportData(BaseModel):
    overall_score: float = 0.0
    verdict: str = ""
    strengths: list[str] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    topic_scores: dict[str, float] = Field(default_factory=dict)


class CodeTaskData(BaseModel):
    title: str
    description: str
    topic: str = "Алгоритмы и структуры данных"
    language: str = "python"
    difficulty: Literal["easy", "medium", "hard"] = "medium"
    starter_code: str = ""
    hints: list[str] = Field(default_factory=list)


class CodeIssueData(BaseModel):
    severity: Literal["critical", "major", "minor", "nit"] = "minor"
    title: str
    detail: str = ""


class CodeReviewData(BaseModel):
    score: float = 0.0
    verdict: str = ""
    correctness_notes: str = ""
    issues: list[CodeIssueData] = Field(default_factory=list)
    improved_code: str = ""
    time_complexity: str | None = None
    space_complexity: str | None = None


class AIHealthInfo(BaseModel):
    provider: str
    model: str
    mode: Literal["live", "offline"]
    available: bool
    message: str = ""


class AIService(ABC):
    """Единая точка входа во все интеллектуальные функции."""

    # --- вопросы ---
    @abstractmethod
    def generate_questions(
        self,
        *,
        role: str,
        level: str,
        mode: str,
        count: int,
        focus_topics: list[str] | None = None,
        resume_text: str | None = None,
        exclude: list[str] | None = None,
    ) -> list[GeneratedQuestion]:
        """Вернуть ровно count вопросов (теория и/или код по режиму)."""

    @abstractmethod
    def next_question(
        self,
        *,
        role: str,
        level: str,
        mode: str,
        focus_topics: list[str] | None = None,
        weak_topics: list[str] | None = None,
        exclude: list[str] | None = None,
    ) -> GeneratedQuestion:
        """Один адаптивный вопрос под слабые места."""

    # --- оценка ---
    @abstractmethod
    def evaluate_answer(
        self,
        *,
        question: dict[str, Any],
        answer_text: str,
        role: str,
        level: str,
    ) -> EvaluationResult:
        """Оценить ответ по 4 критериям, дать эталон и рекомендацию."""

    @abstractmethod
    def build_report(
        self,
        *,
        items: list[dict[str, Any]],
        role: str,
        level: str,
        duration_sec: int,
    ) -> SessionReportData:
        """Собрать отчёт по сессии (оценки, сильные/слабые темы, советы)."""

    # --- код ---
    @abstractmethod
    def generate_code_task(
        self,
        *,
        topic: str | None,
        language: str,
        difficulty: str,
        role: str,
        level: str,
    ) -> CodeTaskData:
        """Задача на кодирование + заготовка кода и подсказки."""

    @abstractmethod
    def review_code(
        self,
        *,
        task: dict[str, Any] | None,
        code: str,
        language: str,
        topic: str | None = None,
    ) -> CodeReviewData:
        """ИИ-ревью без исполнения кода."""

    # --- чат ---
    @abstractmethod
    def chat(self, *, messages: list[dict[str, str]], context: str | None = None) -> str:
        """Ответ ассистента целиком."""

    @abstractmethod
    def chat_stream(
        self, *, messages: list[dict[str, str]], context: str | None = None
    ) -> Iterator[str]:
        """Потоковые дельты ответа ассистента."""

    # --- служебное ---
    @abstractmethod
    def transcribe(self, *, audio: bytes, filename: str) -> str | None:
        """Распознать речь сервером (None, если провайдер не умеет)."""

    @abstractmethod
    def health(self) -> AIHealthInfo:
        """Состояние провайдера для UI."""

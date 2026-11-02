"""Живой ИИ-движок: все методы выполняются через LLM-провайдера.

Реализация ``AIService`` поверх ``app.ai.providers.LLMClient``:
* каждый метод формирует сообщения из ``app.ai.prompts`` и просит строгий JSON;
* ответ валидируется pydantic-схемами из ``app.ai.base``;
* при невалидном JSON выполняется ровно один повтор с уточнением, после чего
  поднимается ``LLMError`` — ``AIServiceImpl`` (app/ai/service.py) прозрачно
  переключит запрос на офлайн-движок;
* ``chat_stream`` отдаёт потоковые дельты, ``transcribe`` — Whisper.
"""
from __future__ import annotations

import logging
from collections.abc import Callable, Iterator
from typing import Any, TypeVar

from pydantic import ValidationError

from app.ai import prompts
from app.ai.base import (
    AIHealthInfo,
    AIService,
    CodeIssueData,
    CodeReviewData,
    CodeTaskData,
    EvaluationResult,
    GeneratedQuestion,
    SessionReportData,
)
from app.ai.providers import LLMClient, LLMError, extract_json_object
from app.config import settings

logger = logging.getLogger(__name__)

T = TypeVar("T")

CRITERIA_KEYS = ("correctness", "completeness", "depth", "clarity")
DIFFICULTIES = {"easy", "medium", "hard"}
QUESTION_TYPES = {"theory", "code"}
SEVERITIES = {"critical", "major", "minor", "nit"}


# ---------------------------------------------------------------- утилиты
def _clamp(value: Any, low: float = 0.0, high: float = 10.0) -> float:
    """Приводит значение к float в заданном диапазоне с округлением до 0,1."""
    try:
        number = float(value)
    except (TypeError, ValueError):
        return low
    if number != number:  # NaN
        return low
    return round(max(low, min(high, number)), 1)


def _text(value: Any) -> str:
    """Строка без краевых пробелов (для None — пустая строка)."""
    return str(value or "").strip()


def _string_list(value: Any, *, limit: int = 5) -> list[str]:
    """Список непустых уникальных строк из произвольного значения."""
    if isinstance(value, str):
        source: list[Any] = [value]
    elif isinstance(value, (list, tuple)):
        source = list(value)
    else:
        source = []
    result: list[str] = []
    for item in source:
        if isinstance(item, dict):
            candidate = _text(item.get("text") or item.get("title") or item.get("detail"))
        else:
            candidate = _text(item)
        if candidate and candidate not in result:
            result.append(candidate)
        if len(result) >= limit:
            break
    return result


def _normalized_points(value: Any) -> list[str]:
    """Ожидаемые пункты ответа в виде списка строк."""
    return _string_list(value, limit=10)


def _normalized_question(item: Any) -> dict[str, Any]:
    """Нормализует элемент вопроса перед валидацией схемой."""
    data = item if isinstance(item, dict) else {}
    question_type = _text(data.get("type")).lower() or "theory"
    if question_type not in QUESTION_TYPES:
        question_type = "theory"
    difficulty = _text(data.get("difficulty")).lower() or "medium"
    if difficulty not in DIFFICULTIES:
        difficulty = "medium"
    starter = data.get("starter_code")
    language = data.get("language")
    return {
        "text": _text(data.get("text") or data.get("question")),
        "topic": _text(data.get("topic")) or "Общее",
        "difficulty": difficulty,
        "type": question_type,
        "expected_points": _normalized_points(data.get("expected_points")),
        "starter_code": _text(starter) or None if question_type == "code" else None,
        "language": _text(language) or ("python" if question_type == "code" else None),
    }


def _normalized_task(data: dict[str, Any], *, language: str, difficulty: str, topic: str | None) -> dict[str, Any]:
    """Нормализует задачу с кодом."""
    result_language = _text(data.get("language")).lower() or language
    result_difficulty = _text(data.get("difficulty")).lower() or difficulty
    if result_difficulty not in DIFFICULTIES:
        result_difficulty = difficulty if difficulty in DIFFICULTIES else "medium"
    return {
        "title": _text(data.get("title")) or "Практическая задача",
        "description": _text(data.get("description")) or "Условие задачи не получено.",
        "topic": _text(data.get("topic")) or topic or "Алгоритмы и структуры данных",
        "language": result_language,
        "difficulty": result_difficulty,
        "starter_code": _text(data.get("starter_code")),
        "hints": _string_list(data.get("hints"), limit=4),
    }


def _normalized_issues(value: Any) -> list[CodeIssueData]:
    """Нормализует список замечаний код-ревью."""
    if not isinstance(value, list):
        return []
    issues: list[CodeIssueData] = []
    for item in value:
        if isinstance(item, str):
            title, detail = _text(item), ""
        elif isinstance(item, dict):
            title = _text(item.get("title") or item.get("text"))
            detail = _text(item.get("detail") or item.get("description"))
        else:
            continue
        if not title:
            continue
        severity = _text(item.get("severity") if isinstance(item, dict) else "").lower()
        if severity not in SEVERITIES:
            severity = "minor"
        issues.append(
            CodeIssueData(severity=severity, title=title[:250], detail=detail[:2000])
        )
        if len(issues) >= 12:
            break
    return issues


def _fallback_verdict(score: float) -> str:
    if score >= 8.0:
        return "Отличный результат: ответы уверенные и полные."
    if score >= 6.0:
        return "Хороший уровень: база есть, отдельные темы нужно углубить."
    if score >= 4.0:
        return "Базовый уровень: заметные пробелы, нужна системная подготовка."
    return "Начальный уровень: начните с основ теории по слабым темам."


class LiveEngine(AIService):
    """Реализация ``AIService`` через OpenAI-совместимый LLM-провайдер."""

    def __init__(self, client: LLMClient | None = None) -> None:
        self._client = client or LLMClient()
        provider = (settings.ai_provider or "auto").lower()
        self._provider = provider if provider in ("openai", "ollama", "gemini") else "openai"

    # --------------------------------------------------------- служебное
    @property
    def available(self) -> bool:
        """Настроен ли реальный провайдер (ключ или локальная Ollama)."""
        return self._client.configured

    @property
    def provider(self) -> str:
        """Имя провайдера для health-эндпоинта."""
        return self._provider

    @property
    def model(self) -> str:
        """Название модели."""
        return self._client.model

    def health(self) -> AIHealthInfo:
        """Состояние провайдера с фактическим ping ``/models``."""
        if not self.available:
            return AIHealthInfo(
                provider=self._provider,
                model=self._client.model,
                mode="live",
                available=False,
                message="Ключ API не задан — доступен только офлайн-режим",
            )
        ok, message = self._client.ping()
        return AIHealthInfo(
            provider=self._provider,
            model=self._client.model,
            mode="live",
            available=ok,
            message=message,
            latency_ms=self._client.last_ping_ms,
        )

    def _call_json(
        self,
        messages: list[dict[str, str]],
        parser: Callable[[str], T],
        *,
        label: str,
    ) -> T:
        """Запрос с JSON-режимом, валидацией схемы и одним повтором."""
        last_text = ""
        for attempt in range(2):
            current = messages
            if attempt > 0:
                current = prompts.retry_messages(messages, last_text, label=label)
            last_text = self._client.chat(
                current,
                json_mode=True,
                temperature=0.1 if attempt > 0 else None,
            )
            try:
                return parser(last_text)
            except (ValueError, ValidationError, KeyError, TypeError) as exc:
                logger.warning(
                    "LLM вернула невалидный JSON для «%s» (попытка %d/2): %s",
                    label,
                    attempt + 1,
                    exc,
                )
        raise LLMError(f"Модель не вернула корректный JSON для запроса «{label}»")

    # ------------------------------------------------------------ вопросы
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
        """Генерирует вопросы через LLM."""
        total = max(0, int(count))
        if total == 0:
            return []
        messages = prompts.build_questions_messages(
            role=role,
            level=level,
            mode=mode,
            count=total,
            focus_topics=focus_topics,
            resume_text=resume_text,
            exclude=exclude,
        )

        def parse(text: str) -> list[GeneratedQuestion]:
            data = extract_json_object(text)
            raw: Any = data.get("questions") or data.get("items") or data.get("data")
            if raw is None:
                for value in data.values():
                    if isinstance(value, list):
                        raw = value
                        break
            if not isinstance(raw, list):
                raise ValueError("В JSON нет массива questions")
            questions: list[GeneratedQuestion] = []
            for item in raw:
                if not isinstance(item, dict):
                    continue
                question = GeneratedQuestion.model_validate(_normalized_question(item))
                if question.text.strip():
                    questions.append(question)
            if not questions:
                raise ValueError("Модель вернула пустой список вопросов")
            return questions[:total]

        return self._call_json(messages, parse, label="генерация вопросов")

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
        """Один адаптивный вопрос через LLM."""
        messages = prompts.build_next_question_messages(
            role=role,
            level=level,
            mode=mode,
            focus_topics=focus_topics,
            weak_topics=weak_topics,
            exclude=exclude,
        )

        def parse(text: str) -> GeneratedQuestion:
            data = extract_json_object(text)
            item: Any = data.get("question") if isinstance(data.get("question"), dict) else data
            if not isinstance(item, dict):
                raise ValueError("В JSON нет объекта question")
            question = GeneratedQuestion.model_validate(_normalized_question(item))
            if not question.text.strip():
                raise ValueError("Пустой текст вопроса")
            return question

        return self._call_json(messages, parse, label="адаптивный вопрос")

    # ------------------------------------------------------------- оценка
    def evaluate_answer(
        self,
        *,
        question: dict[str, Any],
        answer_text: str,
        role: str,
        level: str,
    ) -> EvaluationResult:
        """Оценка ответа через LLM с нормализацией диапазонов и полей."""
        messages = prompts.build_evaluation_messages(
            question=question,
            answer_text=answer_text,
            role=role,
            level=level,
        )

        def parse(text: str) -> EvaluationResult:
            data = extract_json_object(text)
            raw_score = data.get("score")
            raw_criteria = data.get("criteria") if isinstance(data.get("criteria"), dict) else {}
            criteria: dict[str, float] = {}
            for key in CRITERIA_KEYS:
                fallback = raw_score if raw_score is not None else 0.0
                criteria[key] = _clamp(raw_criteria.get(key, fallback))
            score = sum(criteria.values()) / len(criteria) if raw_score is None else _clamp(raw_score)

            strengths = _string_list(data.get("strengths"), limit=4)
            gaps = _string_list(data.get("gaps"), limit=4)
            ideal_answer = _text(data.get("ideal_answer"))
            if not ideal_answer:
                points = _normalized_points(question.get("expected_points"))
                ideal_answer = (
                    "Эталонный ответ: " + "; ".join(points)
                    if points
                    else "Модель не вернула эталонный ответ."
                )
            recommendation = _text(data.get("recommendation")) or (
                f"Повторите тему «{question.get('topic') or 'Общее'}» и ответьте на вопрос ещё раз."
            )
            follow_up = _text(data.get("follow_up_question")) or None
            if not strengths:
                strengths = ["Ответ относится к теме вопроса."]
            if not gaps:
                gaps = ["Добавьте больше конкретики, примеров и ограничений."]
            return EvaluationResult(
                score=score,
                criteria=criteria,
                strengths=strengths,
                gaps=gaps,
                ideal_answer=ideal_answer,
                recommendation=recommendation,
                follow_up_question=follow_up,
            )

        return self._call_json(messages, parse, label="оценка ответа")

    def build_report(
        self,
        *,
        items: list[dict[str, Any]],
        role: str,
        level: str,
        duration_sec: int,
    ) -> SessionReportData:
        """Итоговый отчёт по сессии через LLM."""
        messages = prompts.build_report_messages(
            items=items, role=role, level=level, duration_sec=duration_sec
        )

        def parse(text: str) -> SessionReportData:
            data = extract_json_object(text)
            items_scores: list[float] = []
            items_topics: dict[str, list[float]] = {}
            for item in items or []:
                if not isinstance(item, dict):
                    continue
                evaluation = item.get("evaluation") if isinstance(item.get("evaluation"), dict) else {}
                question = item.get("question") if isinstance(item.get("question"), dict) else {}
                score = _clamp(evaluation.get("score", 0.0))
                items_scores.append(score)
                items_topics.setdefault(_text(question.get("topic")) or "Общее", []).append(score)
            items_average = (
                round(sum(items_scores) / len(items_scores), 1) if items_scores else 0.0
            )

            raw_topics = data.get("topic_scores") if isinstance(data.get("topic_scores"), dict) else {}
            topic_scores: dict[str, float] = {}
            for topic, value in raw_topics.items():
                name = _text(topic)[:120]
                if name:
                    topic_scores[name] = _clamp(value)
            if not topic_scores and items_topics:
                topic_scores = {
                    topic: round(sum(values) / len(values), 1)
                    for topic, values in items_topics.items()
                }

            overall = _clamp(data.get("overall_score")) if data.get("overall_score") is not None else items_average
            if not data.get("overall_score") and items_average:
                overall = items_average
            strengths = _string_list(data.get("strengths"), limit=6)
            gaps = _string_list(data.get("gaps"), limit=6)
            recommendations = _string_list(data.get("recommendations"), limit=5)
            if not strengths:
                strengths = [
                    f"Тема «{topic}»: средний балл {value}."
                    for topic, value in sorted(topic_scores.items(), key=lambda pair: -pair[1])[:3]
                ] or ["Ответы даны по существу — база для роста есть."]
            if not gaps:
                gaps = [
                    f"Тема «{topic}» требует повторения (средний балл {value})."
                    for topic, value in sorted(topic_scores.items(), key=lambda pair: pair[1])[:3]
                    if value < 7.0
                ] or ["Углубите ответы: ограничения, компромиссы и граничные случаи."]
            if not recommendations:
                weak = sorted(topic_scores.items(), key=lambda pair: pair[1])[:2]
                recommendations = [
                    f"Повторите тему «{topic}» (средний балл {value})." for topic, value in weak
                ] or ["Продолжайте тренироваться: 2–3 собеседования в неделю."]
            verdict = _text(data.get("verdict")) or _fallback_verdict(overall)
            return SessionReportData(
                overall_score=overall,
                verdict=verdict,
                strengths=strengths,
                gaps=gaps,
                recommendations=recommendations,
                topic_scores=topic_scores,
            )

        return self._call_json(messages, parse, label="отчёт по сессии")

    # --------------------------------------------------------------- код
    def generate_code_task(
        self,
        *,
        topic: str | None,
        language: str,
        difficulty: str,
        role: str,
        level: str,
    ) -> CodeTaskData:
        """Генерация задачи с кодом через LLM."""
        normalized_language = (language or "python").strip().lower()
        normalized_difficulty = difficulty if difficulty in DIFFICULTIES else "medium"
        messages = prompts.build_code_task_messages(
            topic=topic,
            language=normalized_language,
            difficulty=normalized_difficulty,
            role=role,
            level=level,
        )

        def parse(text: str) -> CodeTaskData:
            data = extract_json_object(text)
            task = CodeTaskData.model_validate(
                _normalized_task(
                    data,
                    language=normalized_language,
                    difficulty=normalized_difficulty,
                    topic=topic,
                )
            )
            if not task.description.strip():
                raise ValueError("Пустое описание задачи")
            return task

        return self._call_json(messages, parse, label="генерация код-задачи")

    def review_code(
        self,
        *,
        task: dict[str, Any] | None,
        code: str,
        language: str,
        topic: str | None = None,
    ) -> CodeReviewData:
        """Код-ревью через LLM (без исполнения кода)."""
        normalized_language = (language or "python").strip().lower()
        messages = prompts.build_code_review_messages(
            task=task, code=code, language=normalized_language, topic=topic
        )

        def parse(text: str) -> CodeReviewData:
            data = extract_json_object(text)
            score = _clamp(data.get("score"))
            issues = _normalized_issues(data.get("issues"))
            verdict = _text(data.get("verdict")) or _fallback_verdict(score)
            notes = _text(data.get("correctness_notes")) or (
                "Модель не дала разбор логики — ориентируйтесь на замечания ниже."
            )
            improved = _text(data.get("improved_code")) or code
            return CodeReviewData(
                score=score,
                verdict=verdict,
                correctness_notes=notes,
                issues=issues,
                improved_code=improved,
                time_complexity=_text(data.get("time_complexity")) or None,
                space_complexity=_text(data.get("space_complexity")) or None,
            )

        return self._call_json(messages, parse, label="код-ревью")

    # --------------------------------------------------------------- чат
    def chat(self, *, messages: list[dict[str, str]], context: str | None = None) -> str:
        """Ответ ассистента целиком."""
        return self._client.chat(
            prompts.build_chat_messages(messages=messages, context=context),
        )

    def chat_stream(
        self, *, messages: list[dict[str, str]], context: str | None = None
    ) -> Iterator[str]:
        """Потоковые дельты ответа ассистента."""
        return self._client.chat_stream(
            prompts.build_chat_messages(messages=messages, context=context),
        )

    # --------------------------------------------------------- служебное
    def transcribe(self, *, audio: bytes, filename: str) -> str | None:
        """Распознавание речи через Whisper-совместимый эндпоинт."""
        if not self.available:
            raise LLMError("Провайдер распознавания речи не настроен")
        return self._client.transcribe(audio=audio, filename=filename)

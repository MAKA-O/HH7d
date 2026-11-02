"""ИИ-слой: единый сервис с автоматическим переключением провайдеров.

Логика:
* если в настройках задан реальный провайдер (AI_API_KEY / AI_PROVIDER=ollama) —
  создаётся LiveEngine (app/ai/live.py);
* всегда создаётся OfflineEngine (app/ai/offline.py) как запасной вариант;
* при ошибке живой модели запрос автоматически уходит в офлайн-движок,
  поэтому тренажёр остаётся полностью работоспособным без интернета и ключей.
"""
from __future__ import annotations

import logging
import time
from collections.abc import Iterator
from typing import Any

from app.ai.base import (
    AIHealthInfo,
    AIService,
    CodeReviewData,
    CodeTaskData,
    EvaluationResult,
    GeneratedQuestion,
    SessionReportData,
)
from app.config import settings

logger = logging.getLogger(__name__)


class AIServiceImpl(AIService):
    def __init__(self) -> None:
        self._live = self._build_live()
        self._offline = self._build_offline()
        # Предохранитель: после сбоя живой модели не ждём её снова заданное время.
        self._live_off_until = 0.0
        self._cooldown_sec = max(30.0, float(settings.ai_failure_cooldown_sec))
        if self._live is None and self._offline is None:
            logger.error("ИИ-слой не инициализирован: нет ни live-, ни offline-движка")
        logger.info(
            "ИИ-сервис запущен: mode=%s, live=%s",
            "live" if self._live is not None else "offline",
            settings.ai_model if self._live is not None else "-",
        )

    # ---------------------------------------------------------------- создание
    @staticmethod
    def _build_live() -> AIService | None:
        if not settings.ai_enabled:
            return None
        try:
            from app.ai.live import LiveEngine

            engine = LiveEngine()
            return engine if engine.available else None
        except Exception as exc:  # pragma: no cover - зависит от окружения
            logger.warning("Не удалось инициализировать живой ИИ-провайдер: %s", exc)
            return None

    @staticmethod
    def _build_offline() -> AIService | None:
        try:
            from app.ai.offline import OfflineEngine

            return OfflineEngine()
        except Exception as exc:  # модуль ещё не реализован / сломан
            logger.error("Не удалось инициализировать офлайн-движок ИИ: %s", exc)
            return None

    # ---------------------------------------------------------------- вызовы
    def _live_call(self, method: str, /, **kwargs: Any) -> Any:
        if self._live is None:
            raise RuntimeError("Живой ИИ-провайдер не настроен")
        return getattr(self._live, method)(**kwargs)

    def _offline_call(self, method: str, /, **kwargs: Any) -> Any:
        if self._offline is None:
            raise RuntimeError("Офлайн-движок ИИ недоступен")
        return getattr(self._offline, method)(**kwargs)

    # ------------------------------------------------------- предохранитель
    def _breaker_active(self) -> bool:
        """True, если недавно был сбой и мы пока работаем офлайн без ожидания."""
        return self._live is not None and time.monotonic() < self._live_off_until

    def _trip_breaker(self, exc: BaseException | str) -> None:
        self._live_off_until = time.monotonic() + self._cooldown_sec
        logger.warning(
            "Живой ИИ недоступен (%s). Следующие %.0f с работаем в офлайн-режиме.",
            exc,
            self._cooldown_sec,
        )

    def _dispatch(self, method: str, /, **kwargs: Any) -> Any:
        if self._breaker_active():
            logger.info("Провайдер %s: офлайн-режим по предохранителю", method)
        elif self._live is not None:
            try:
                return self._live_call(method, **kwargs)
            except Exception as exc:
                self._trip_breaker(exc)
        return self._offline_call(method, **kwargs)

    # --- вопросы ---
    def generate_questions(self, **kwargs: Any) -> list[GeneratedQuestion]:
        return self._dispatch("generate_questions", **kwargs)

    def next_question(self, **kwargs: Any) -> GeneratedQuestion:
        return self._dispatch("next_question", **kwargs)

    # --- оценка ---
    def evaluate_answer(self, **kwargs: Any) -> EvaluationResult:
        return self._dispatch("evaluate_answer", **kwargs)

    def build_report(self, **kwargs: Any) -> SessionReportData:
        return self._dispatch("build_report", **kwargs)

    # --- код ---
    def generate_code_task(self, **kwargs: Any) -> CodeTaskData:
        return self._dispatch("generate_code_task", **kwargs)

    def review_code(self, **kwargs: Any) -> CodeReviewData:
        return self._dispatch("review_code", **kwargs)

    # --- чат ---
    def chat(self, *, messages: list[dict[str, str]], context: str | None = None) -> str:
        return self._dispatch("chat", messages=messages, context=context)

    def chat_stream(
        self, *, messages: list[dict[str, str]], context: str | None = None
    ) -> Iterator[str]:
        if self._live is not None and not self._breaker_active():
            try:
                stream = self._live.chat_stream(messages=messages, context=context)
                first = next(stream)
            except StopIteration:
                return
            except Exception as exc:
                self._trip_breaker(exc)
            else:
                yield first
                try:
                    yield from stream
                except Exception as exc:  # обрыв посреди потока
                    logger.warning("Поток живого провайдера прервался: %s", exc)
                return
        if self._offline is None:
            raise RuntimeError("ИИ-слой недоступен")
        yield from self._offline.chat_stream(messages=messages, context=context)

    # --- служебное ---
    def transcribe(self, *, audio: bytes, filename: str) -> str | None:
        if self._live is None:
            return None
        try:
            return self._live.transcribe(audio=audio, filename=filename)
        except Exception as exc:
            logger.warning("Распознавание речи недоступно: %s", exc)
            return None

    def health(self) -> AIHealthInfo:
        if self._live is not None and not self._breaker_active():
            try:
                info = self._live.health()
                if info.available:
                    return info
                self._trip_breaker(info.message or "health-check не пройден")
            except Exception as exc:  # pragma: no cover
                self._trip_breaker(exc)
        if self._offline is None:
            raise RuntimeError("ИИ-слой недоступен")
        info = self._offline.health()
        if self._live is not None:
            info.message = (
                "Живой ИИ временно недоступен (квота/ошибка) — "
                "включён офлайн-режим, всё работает без задержек"
            )
        return info

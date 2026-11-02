"""Фабрика ИИ-сервиса: единственный способ получить AIService в роутерах."""
from __future__ import annotations

import threading

from app.ai.base import AIService

_lock = threading.Lock()
_instance: AIService | None = None


def get_ai_service() -> AIService:
    global _instance
    if _instance is None:
        with _lock:
            if _instance is None:
                from app.ai.service import AIServiceImpl

                _instance = AIServiceImpl()
    return _instance


def reset_ai_service() -> None:
    """Сбросить кэш (используется в тестах и при смене настроек)."""
    global _instance
    with _lock:
        _instance = None

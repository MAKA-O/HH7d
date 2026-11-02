"""Состояние ИИ-провайдера для интерфейса (docs/API.md §7)."""
from __future__ import annotations

import logging

from fastapi import APIRouter

from app.ai.base import AIHealthInfo
from app.ai.factory import get_ai_service
from app.schemas import AIHealthOut

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["ai"])

# Запасной ответ, если инициализация ИИ-слоя не удалась: офлайн-движок
# не требует сети и ключей, поэтому health всегда должен отдавать 200.
_OFFLINE_FALLBACK = AIHealthInfo(
    provider="offline",
    model="offline-demo",
    mode="offline",
    available=True,
    message=(
        "Встроенный офлайн-движок: работает без ключа API и интернета "
        "(эвристики и база знаний)."
    ),
)


@router.get("/health", response_model=AIHealthOut, summary="Состояние ИИ-провайдера")
def ai_health() -> AIHealthOut:
    """Возвращает состояние провайдера: ``live`` (модель отвечает) или ``offline``."""
    try:
        info = get_ai_service().health()
    except Exception as exc:  # pragma: no cover - защита от сбоя инициализации
        logger.warning("Не удалось получить состояние ИИ-слоя: %s", exc)
        info = _OFFLINE_FALLBACK
    return AIHealthOut(**info.model_dump())

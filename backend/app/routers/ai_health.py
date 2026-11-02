"""Состояние ИИ-провайдера для интерфейса."""
from fastapi import APIRouter

from app.ai.factory import get_ai_service
from app.schemas import AIHealthOut

router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/health", response_model=AIHealthOut, summary="Состояние ИИ-провайдера")
def ai_health() -> AIHealthOut:
    info = get_ai_service().health()
    return AIHealthOut(**info.model_dump())

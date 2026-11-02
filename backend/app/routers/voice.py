"""Распознавание речи на сервере (опционально; реализация — за ai-engine)."""
from fastapi import APIRouter

router = APIRouter(prefix="/voice", tags=["voice"])

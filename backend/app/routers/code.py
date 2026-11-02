"""Задачи с кодом и ИИ-ревью (реализация — за ai-engine, см. docs/API.md §5)."""
from fastapi import APIRouter

router = APIRouter(prefix="/code", tags=["code"])

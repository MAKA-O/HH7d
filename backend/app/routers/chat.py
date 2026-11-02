"""Чат-ассистент по теории (реализация — за ai-engine, см. docs/API.md §4)."""
from fastapi import APIRouter

router = APIRouter(prefix="/chat", tags=["chat"])

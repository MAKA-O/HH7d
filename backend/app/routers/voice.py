"""Распознавание речи на сервере (docs/API.md §7).

Если провайдер умеет ``/audio/transcriptions`` (Whisper) — текст возвращается
клиенту, иначе отдаётся ``503``, и фронтенд использует встроенный Web Speech API.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.ai.factory import get_ai_service
from app.schemas import TranscriptOut

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/voice", tags=["voice"])

MAX_AUDIO_BYTES = 25 * 1024 * 1024
ALLOWED_CONTENT_TYPES = {
    "audio/webm",
    "video/webm",
    "audio/wav",
    "audio/x-wav",
    "audio/wave",
    "audio/mpeg",
    "audio/mp3",
    "audio/mp4",
    "audio/m4a",
    "audio/ogg",
    "application/octet-stream",
}


@router.post(
    "/transcribe",
    response_model=TranscriptOut,
    summary="Распознать речь (multipart/form-data, поле file)",
)
def transcribe(file: UploadFile = File(...)) -> TranscriptOut:
    """Серверная транскрипция аудио; ``503``, если провайдер не настроен."""
    if file.content_type and file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Неподдерживаемый формат аудио. Отправьте webm, wav или mp3.",
        )
    try:
        audio = file.file.read()
    except Exception as exc:  # pragma: no cover - сбой чтения загруженного файла
        logger.warning("Не удалось прочитать аудиофайл: %s", exc)
        raise HTTPException(status_code=400, detail="Не удалось прочитать аудиофайл") from exc
    finally:
        try:
            file.file.close()
        except Exception:  # pragma: no cover
            pass

    if not audio:
        raise HTTPException(status_code=400, detail="Пустой аудиофайл")
    if len(audio) > MAX_AUDIO_BYTES:
        raise HTTPException(
            status_code=400,
            detail="Аудиофайл слишком большой (максимум 25 МБ).",
        )

    try:
        text = get_ai_service().transcribe(
            audio=audio, filename=file.filename or "audio.webm"
        )
    except Exception as exc:
        logger.warning("Распознавание речи завершилось ошибкой: %s", exc)
        text = None

    if not text or not text.strip():
        raise HTTPException(
            status_code=503,
            detail=(
                "Серверное распознавание речи недоступно. "
                "Используйте микрофон браузера (Web Speech API)."
            ),
        )
    return TranscriptOut(text=text.strip())

"""Чат-ассистент по теории (docs/API.md §4).

Эндпоинты работают через ``get_ai_service()``: при наличии ключа API — живая
модель, иначе — офлайн-движок. Стриминг отдаёт SSE-события:
``data: {"delta": ...}`` → ``data: {"done": true, "message_id": N}`` → ``data: [DONE]``.
"""
from __future__ import annotations

import json
import logging
from collections.abc import Iterator

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.ai.factory import get_ai_service
from app.db import SessionLocal, get_db
from app.deps import get_current_user
from app.models import ChatConversation, ChatMessage, User, utcnow
from app.schemas import (
    ChatMessageListOut,
    ChatMessageOut,
    ChatSendIn,
    ChatTurnOut,
    ConversationCreate,
    ConversationListOut,
    ConversationOut,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])

DEFAULT_TITLE = "Новый диалог"
HISTORY_LIMIT = 20
TITLE_MAX_LEN = 60
SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


# ----------------------------------------------------------------- помощники
def _get_conversation(db: Session, user: User, conversation_id: int) -> ChatConversation:
    """Возвращает диалог пользователя или 404."""
    conversation = db.scalar(
        select(ChatConversation).where(
            ChatConversation.id == conversation_id,
            ChatConversation.user_id == user.id,
        )
    )
    if conversation is None:
        raise HTTPException(status_code=404, detail="Диалог не найден")
    return conversation


def _conversation_out(conversation: ChatConversation) -> ConversationOut:
    """Схема диалога с количеством сообщений."""
    return ConversationOut(
        id=conversation.id,
        title=conversation.title,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        message_count=len(conversation.messages),
    )


def _make_title(content: str) -> str:
    """Автоматическое название диалога по первому сообщению."""
    text = " ".join((content or "").split())
    if not text:
        return DEFAULT_TITLE
    if len(text) <= TITLE_MAX_LEN:
        return text[:255]
    cut = text[:TITLE_MAX_LEN]
    if " " in cut:
        cut = cut.rsplit(" ", 1)[0]
    return cut.rstrip(" ,.;:!?")[:255] + "…"


def _sse(payload: dict) -> str:
    """Сериализует одно SSE-событие."""
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _history_for_ai(conversation: ChatConversation) -> list[dict[str, str]]:
    """История диалога (последние сообщения) для промпта ассистента."""
    messages = [
        {"role": message.role, "content": message.content}
        for message in conversation.messages
        if message.role in ("user", "assistant") and message.content.strip()
    ]
    return messages[-HISTORY_LIMIT:]


def _stream_answer(
    conversation_id: int,
    prompt_messages: list[dict[str, str]],
) -> Iterator[str]:
    """Генератор SSE: потоковые дельты и сохранение ответа в БД."""
    service = get_ai_service()
    chunks: list[str] = []
    try:
        for delta in service.chat_stream(messages=prompt_messages):
            if not delta:
                continue
            chunks.append(delta)
            yield _sse({"delta": delta})
    except Exception as exc:  # pragma: no cover - защита от обрыва провайдера
        logger.exception("Ошибка потокового ответа чат-ассистента: %s", exc)
        yield _sse({"error": "Не удалось получить ответ ассистента. Попробуйте ещё раз."})
        return

    answer = "".join(chunks).strip()
    if not answer:
        yield _sse({"error": "Ассистент не вернул ответ. Попробуйте переформулировать вопрос."})
        return

    message_id: int | None = None
    try:
        with SessionLocal() as db:
            assistant_message = ChatMessage(
                conversation_id=conversation_id, role="assistant", content=answer
            )
            db.add(assistant_message)
            conversation = db.get(ChatConversation, conversation_id)
            if conversation is not None:
                conversation.updated_at = utcnow()
            db.commit()
            message_id = assistant_message.id
    except Exception as exc:  # pragma: no cover - сбой БД посреди стрима
        logger.exception("Не удалось сохранить ответ ассистента: %s", exc)
        yield _sse({"error": "Ответ получен, но не сохранён. Обновите страницу."})
        return

    yield _sse({"done": True, "message_id": message_id})
    yield "data: [DONE]\n\n"


# ---------------------------------------------------------------- эндпоинты
@router.get(
    "/conversations",
    response_model=ConversationListOut,
    summary="Диалоги пользователя",
)
def list_conversations(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ConversationListOut:
    total = db.scalar(
        select(func.count())
        .select_from(ChatConversation)
        .where(ChatConversation.user_id == user.id)
    ) or 0
    conversations = db.scalars(
        select(ChatConversation)
        .where(ChatConversation.user_id == user.id)
        .order_by(ChatConversation.updated_at.desc(), ChatConversation.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return ConversationListOut(
        items=[_conversation_out(conversation) for conversation in conversations],
        total=int(total),
    )


@router.post(
    "/conversations",
    response_model=ConversationOut,
    status_code=status.HTTP_201_CREATED,
    summary="Создать диалог",
)
def create_conversation(
    payload: ConversationCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ConversationOut:
    title = (payload.title or "").strip() or DEFAULT_TITLE
    conversation = ChatConversation(user_id=user.id, title=title[:255])
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return _conversation_out(conversation)


@router.get(
    "/conversations/{conversation_id}/messages",
    response_model=ChatMessageListOut,
    summary="Сообщения диалога",
)
def list_messages(
    conversation_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChatMessageListOut:
    conversation = _get_conversation(db, user, conversation_id)
    return ChatMessageListOut(
        items=[ChatMessageOut.model_validate(message) for message in conversation.messages]
    )


@router.post(
    "/conversations/{conversation_id}/messages",
    response_model=ChatTurnOut,
    summary="Отправить сообщение ассистенту",
)
def send_message(
    conversation_id: int,
    payload: ChatSendIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Ответ ассистента: обычный JSON или SSE-поток при ``stream=true``."""
    conversation = _get_conversation(db, user, conversation_id)
    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Сообщение не может быть пустым")

    prompt_messages = _history_for_ai(conversation) + [{"role": "user", "content": content}]
    user_message = ChatMessage(conversation_id=conversation.id, role="user", content=content)
    db.add(user_message)
    db.flush()
    if conversation.title in ("", DEFAULT_TITLE):
        conversation.title = _make_title(content)[:255]
    conversation.updated_at = utcnow()

    if payload.stream:
        # Пользовательское сообщение и название сохраняем до старта стрима.
        db.commit()
        return StreamingResponse(
            _stream_answer(conversation.id, prompt_messages),
            media_type="text/event-stream",
            headers=SSE_HEADERS,
        )

    try:
        answer = (get_ai_service().chat(messages=prompt_messages) or "").strip()
    except Exception as exc:
        logger.exception("Ошибка чат-ассистента: %s", exc)
        db.rollback()
        raise HTTPException(
            status_code=503, detail="Чат-ассистент временно недоступен. Попробуйте ещё раз."
        ) from exc
    if not answer:
        db.rollback()
        raise HTTPException(
            status_code=503, detail="Ассистент не вернул ответ. Попробуйте переформулировать вопрос."
        )

    assistant_message = ChatMessage(
        conversation_id=conversation.id, role="assistant", content=answer
    )
    db.add(assistant_message)
    db.commit()
    db.refresh(user_message)
    db.refresh(assistant_message)
    return ChatTurnOut(
        user_message=ChatMessageOut.model_validate(user_message),
        assistant_message=ChatMessageOut.model_validate(assistant_message),
    )


@router.delete(
    "/conversations/{conversation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Удалить диалог",
)
def delete_conversation(
    conversation_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    conversation = _get_conversation(db, user, conversation_id)
    db.delete(conversation)
    db.commit()

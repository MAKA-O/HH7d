"""Задачи с кодом и ИИ-ревью (docs/API.md §5).

Генерация задач и ревью идут через ``get_ai_service()``: с ключом API — живая
модель, без ключа — детерминированные офлайн-эвристики. Код никогда не
исполняется — только статический разбор.
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.ai.factory import get_ai_service
from app.data.catalog import role_topics
from app.db import get_db
from app.deps import get_current_user
from app.models import CodeSubmission, CodeTask, User
from app.schemas import (
    CodeIssue,
    CodeReviewIn,
    CodeReviewListOut,
    CodeReviewOut,
    CodeTaskIn,
    CodeTaskOut,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/code", tags=["code"])

DEFAULT_TOPIC = "Алгоритмы и структуры данных"
ALLOWED_SEVERITIES = {"critical", "major", "minor", "nit"}


# ----------------------------------------------------------------- помощники
def _get_task(db: Session, user: User, task_id: int) -> CodeTask:
    """Возвращает задачу пользователя или 404."""
    task = db.scalar(
        select(CodeTask).where(CodeTask.id == task_id, CodeTask.user_id == user.id)
    )
    if task is None:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    return task


def _default_topic(user: User) -> str:
    """Тема по умолчанию из цели профиля пользователя."""
    topics = role_topics(user.target_role)
    for topic in topics:
        if "алгорит" in topic.lower():
            return topic
    return topics[0] if topics else DEFAULT_TOPIC


def _task_payload(task: CodeTask) -> dict[str, Any]:
    """Задача в виде словаря для передачи в ИИ-ревью."""
    return {
        "title": task.title,
        "description": task.description,
        "topic": task.topic,
        "language": task.language,
        "difficulty": task.difficulty,
        "starter_code": task.starter_code,
    }


def _review_out(submission: CodeSubmission) -> CodeReviewOut:
    """Схема ревью из сохранённой заявки."""
    review = submission.review if isinstance(submission.review, dict) else {}
    issues: list[CodeIssue] = []
    for item in review.get("issues") or []:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        if not title:
            continue
        severity = str(item.get("severity") or "minor").strip().lower()
        if severity not in ALLOWED_SEVERITIES:
            severity = "minor"
        issues.append(
            CodeIssue(
                severity=severity,
                title=title[:250],
                detail=str(item.get("detail") or "")[:2000],
            )
        )
    return CodeReviewOut(
        id=submission.id,
        task_id=submission.task_id,
        score=float(submission.score or 0.0),
        verdict=str(review.get("verdict") or ""),
        correctness_notes=str(review.get("correctness_notes") or ""),
        issues=issues,
        improved_code=str(review.get("improved_code") or ""),
        time_complexity=review.get("time_complexity"),
        space_complexity=review.get("space_complexity"),
        created_at=submission.created_at,
    )


# ---------------------------------------------------------------- эндпоинты
@router.post(
    "/tasks",
    response_model=CodeTaskOut,
    status_code=status.HTTP_201_CREATED,
    summary="Сгенерировать задачу с кодом",
)
def create_code_task(
    payload: CodeTaskIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CodeTaskOut:
    topic = (payload.topic or "").strip() or _default_topic(user)
    level = payload.user_level or user.target_level
    try:
        data = get_ai_service().generate_code_task(
            topic=topic,
            language=payload.language,
            difficulty=payload.difficulty,
            role=user.target_role,
            level=level,
        )
    except Exception as exc:
        logger.exception("Не удалось сгенерировать задачу с кодом: %s", exc)
        raise HTTPException(
            status_code=503, detail="ИИ временно недоступен: не удалось создать задачу."
        ) from exc

    title = (data.title or "").strip()
    description = (data.description or "").strip()
    if not title or not description:
        raise HTTPException(
            status_code=503, detail="ИИ вернул некорректную задачу. Попробуйте ещё раз."
        )

    difficulty = data.difficulty if data.difficulty in ("easy", "medium", "hard") else payload.difficulty
    task = CodeTask(
        user_id=user.id,
        topic=(data.topic or topic)[:120],
        language=(data.language or payload.language)[:30],
        difficulty=difficulty,
        title=title[:255],
        description=description,
        starter_code=data.starter_code or "",
        hints=[str(hint) for hint in data.hints if str(hint).strip()][:8],
        source="ai",
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return CodeTaskOut.model_validate(task)


@router.get(
    "/history",
    response_model=CodeReviewListOut,
    summary="История код-ревью",
)
def review_history(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CodeReviewListOut:
    total = db.scalar(
        select(func.count()).select_from(CodeSubmission).where(CodeSubmission.user_id == user.id)
    ) or 0
    submissions = db.scalars(
        select(CodeSubmission)
        .where(CodeSubmission.user_id == user.id)
        .order_by(CodeSubmission.created_at.desc(), CodeSubmission.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return CodeReviewListOut(
        items=[_review_out(submission) for submission in submissions],
        total=int(total),
    )


@router.get(
    "/tasks/{task_id}",
    response_model=CodeTaskOut,
    summary="Задача по идентификатору",
)
def get_code_task(
    task_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CodeTaskOut:
    return CodeTaskOut.model_validate(_get_task(db, user, task_id))


@router.post(
    "/tasks/{task_id}/review",
    response_model=CodeReviewOut,
    summary="ИИ-ревью решения",
)
def review_code(
    task_id: int,
    payload: CodeReviewIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CodeReviewOut:
    task = _get_task(db, user, task_id)
    code = payload.code
    if not code.strip():
        raise HTTPException(status_code=400, detail="Код решения не может быть пустым")
    try:
        review = get_ai_service().review_code(
            task=_task_payload(task),
            code=code,
            language=task.language,
            topic=task.topic,
        )
    except Exception as exc:
        logger.exception("Не удалось выполнить код-ревью: %s", exc)
        raise HTTPException(
            status_code=503, detail="ИИ временно недоступен: код-ревью не выполнено."
        ) from exc

    score = max(0.0, min(10.0, round(float(review.score or 0.0), 1)))
    submission = CodeSubmission(
        task_id=task.id,
        user_id=user.id,
        language=task.language,
        code=code,
        score=score,
        review={
            "verdict": review.verdict,
            "correctness_notes": review.correctness_notes,
            "issues": [issue.model_dump() for issue in review.issues],
            "improved_code": review.improved_code,
            "time_complexity": review.time_complexity,
            "space_complexity": review.space_complexity,
        },
    )
    db.add(submission)
    db.commit()
    db.refresh(submission)
    return _review_out(submission)

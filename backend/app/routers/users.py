"""Профиль пользователя."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.data.catalog import ROLE_TITLES, normalize_level
from app.db import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas import ProfileIn, UserOut

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("", response_model=UserOut, summary="Профиль")
def get_profile(user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(user)


@router.put("", response_model=UserOut, summary="Обновить профиль")
def update_profile(
    payload: ProfileIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserOut:
    if payload.full_name is not None:
        user.full_name = payload.full_name.strip()
    if payload.target_role is not None:
        if payload.target_role not in ROLE_TITLES:
            raise HTTPException(status_code=400, detail="Неизвестное направление подготовки")
        user.target_role = payload.target_role
    if payload.target_level is not None:
        user.target_level = normalize_level(payload.target_level)
    if payload.resume_text is not None:
        user.resume_text = payload.resume_text.strip()[:10_000] or None
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)

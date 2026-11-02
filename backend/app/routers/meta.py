"""Справочники для UI."""
from fastapi import APIRouter

from app.data.catalog import meta_payload
from app.schemas import MetaOut

router = APIRouter(prefix="/meta", tags=["meta"])


@router.get("", response_model=MetaOut, summary="Направления, уровни, режимы")
def get_meta() -> MetaOut:
    return MetaOut(**meta_payload())

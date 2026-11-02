"""Точка входа FastAPI-приложения."""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.db import init_db
from app.routers import ai_health, analytics, auth, chat, code, interviews, meta, users, voice


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


def _build_api_router() -> APIRouter:
    api = APIRouter(prefix=settings.api_prefix)
    for module in (auth, users, meta, interviews, analytics, chat, code, ai_health, voice):
        api.include_router(module.router)

    @api.get("/health", tags=["service"], summary="Проверка работоспособности")
    def health() -> dict:
        ai_mode = "offline"
        ai_provider = "offline"
        try:
            from app.ai.factory import get_ai_service

            info = get_ai_service().health()
            ai_mode, ai_provider = info.mode, info.provider
        except Exception:  # ИИ-слой может быть ещё не инициализирован
            pass
        return {
            "status": "ok",
            "app": settings.app_name,
            "version": settings.app_version,
            "ai_provider": ai_provider,
            "ai_mode": ai_mode,
        }

    return api


def _mount_frontend(app: FastAPI) -> None:
    """Отдаёт собранный React-бандл (frontend/dist, скопированный в app/static)."""
    static_dir = Path(settings.static_dir)
    index_file = static_dir / "index.html"
    assets_dir = static_dir / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    if not index_file.exists():
        return

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_fallback(full_path: str) -> FileResponse:
        if full_path.startswith(("api/", "api")) and full_path != "api":
            raise HTTPException(status_code=404, detail="Not Found")
        candidate = (static_dir / full_path).resolve()
        try:
            candidate.relative_to(static_dir.resolve())
        except ValueError:
            raise HTTPException(status_code=404, detail="Not Found") from None
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(index_file)


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description=(
            "API интеллектуального тренажёра для подготовки к собеседованиям: "
            "генерация вопросов, ИИ-оценка ответов, чат по теории, код-ревью и аналитика."
        ),
        docs_url=f"{settings.api_prefix}/docs",
        redoc_url=None,
        openapi_url=f"{settings.api_prefix}/openapi.json",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(_build_api_router())
    _mount_frontend(app)
    # Идемпотентно: таблицы нужны и при запуске без ASGI-lifespan (например, в тестах)
    init_db()
    return app


app = create_app()

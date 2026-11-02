"""Настройки приложения (переменные окружения / backend/.env)."""
from functools import lru_cache
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent  # .../backend

# Адреса провайдеров по умолчанию
OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1"
# Gemini: официальный OpenAI-совместимый шлюз
# https://ai.google.dev/gemini-api/docs/openai
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai"
GEMINI_DEFAULT_MODEL = "gemini-3.8-flash"
OLLAMA_BASE_URL = "http://localhost:11434/v1"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Интеллектуальный тренажёр для подготовки к собеседованиям"
    app_version: str = "1.0.0"
    debug: bool = True
    api_prefix: str = "/api"

    # Безопасность
    secret_key: str = "dev-secret-change-me-in-production-please-use-32-bytes-min"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 дней

    # База данных (SQLite по умолчанию, кладём рядом с backend/)
    database_url: str = f"sqlite:///{(BASE_DIR / 'data' / 'app.db').as_posix()}"

    # CORS (dev-сервер Vite)
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]

    # --- ИИ ---
    # auto | openai | gemini | ollama | offline
    #   auto     — если задан AI_API_KEY, работаем через OpenAI-совместимый API,
    #              иначе используем локальный офлайн-движок;
    #   openai   — OpenAI / OpenRouter / DeepSeek / VseGPT и любой совместимый API;
    #   ollama   — локальный сервер Ollama (http://localhost:11434/v1);
    #   offline  — принудительно встроенный офлайн-движок (демо без ключа).
    # Для Gemini достаточно AI_PROVIDER=gemini и ключа — адрес OpenAI-совместимого
    # шлюза и модель подставятся автоматически (см. _apply_provider_defaults).
    ai_provider: str = "auto"
    ai_base_url: str = OPENAI_DEFAULT_BASE_URL
    ai_api_key: str = ""
    ai_model: str = "gpt-4o-mini"
    ai_temperature: float = 0.6
    ai_timeout_sec: float = 90.0
    ai_max_retries: int = 2
    ai_extra_headers: dict[str, str] = {}

    # Статическая сборка фронтенда (отдаётся FastAPI)
    static_dir: str = str(BASE_DIR / "app" / "static")

    # Папка для SQLite
    data_dir: str = str(BASE_DIR / "data")

    @model_validator(mode="after")
    def _apply_provider_defaults(self) -> "Settings":
        """Подставляет адрес и модель по умолчанию для выбранного провайдера.

        Благодаря этому пользователю достаточно указать AI_PROVIDER=gemini и ключ —
        адрес Gemini OpenAI-совместимого шлюза и модель подставятся сами.
        """
        provider = (self.ai_provider or "auto").strip().lower()
        base_url = (self.ai_base_url or "").strip().rstrip("/")
        if provider == "gemini":
            if not base_url or base_url == OPENAI_DEFAULT_BASE_URL:
                self.ai_base_url = GEMINI_BASE_URL
            if not self.ai_model or self.ai_model == "gpt-4o-mini":
                self.ai_model = GEMINI_DEFAULT_MODEL
        elif provider == "ollama":
            if not base_url or base_url == OPENAI_DEFAULT_BASE_URL:
                self.ai_base_url = OLLAMA_BASE_URL
        self.ai_provider = provider
        return self

    @property
    def ai_enabled(self) -> bool:
        """Есть ли реальный провайдер (не офлайн)."""
        provider = (self.ai_provider or "auto").lower()
        if provider == "offline":
            return False
        if provider == "auto":
            return bool(self.ai_api_key.strip())
        if provider == "ollama":
            return True
        return bool(self.ai_api_key.strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

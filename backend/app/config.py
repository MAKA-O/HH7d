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
# Быстрая и бесплатная модель по умолчанию (проверено: ~1 с на короткий ответ).
# Альтернативы для качества: gemini-3.6-flash, gemini-3.5-flash, gemini-3.8-flash.
GEMINI_DEFAULT_MODEL = "gemini-3.5-flash-lite"
OLLAMA_BASE_URL = "http://localhost:11434/v1"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Интеллектуальный тренажёр для подготовки к собеседованиям"
    app_version: str = "1.1.0"
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
    # Несколько ключей API через запятую — из РАЗНЫХ проектов Google/провайдера
    # (квота считается на проект, поэтому второй проект = отдельные лимиты).
    # Пусто — используется старый AI_API_KEY.
    ai_api_keys: str = ""
    ai_model: str = "gpt-4o-mini"
    # Резервные модели через запятую: используются после ai_model при 429/404/503.
    # Пример: gemini-3.6-flash,gemini-3.8-flash,gemini-3.5-flash
    ai_model_fallbacks: str = ""
    # «Остывание» связки ключ+модель (секунды) при исчерпанной квоте (429 quota).
    ai_quota_cooldown_sec: int = 900
    # «Остывание» ключа при 401/403 (невалидный/заблокированный ключ).
    ai_key_cooldown_sec: int = 3600
    # «Остывание» модели при 404 / 400 «model not found/not supported».
    ai_model_cooldown_sec: int = 3600
    # Управление «размышлением» модели (Gemini 3.x/4, reasoning-модели):
    #   minimal | low | medium | high | none | пусто (не передавать).
    # Для Gemini по умолчанию minimal — заметно быстрее, чем режим по умолчанию.
    ai_reasoning_effort: str = ""
    ai_temperature: float = 0.6
    ai_timeout_sec: float = 45.0
    ai_max_retries: int = 1
    # После сбоя живого провайдера (квота 429, сеть) столько секунд сразу
    # работаем офлайн, не пытаясь снова ждать ответа от внешней модели.
    ai_failure_cooldown_sec: int = 120
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
    def api_key_list(self) -> list[str]:
        """Список ключей API: ``AI_API_KEYS`` (разные проекты) или ``AI_API_KEY``."""
        raw = self.ai_api_keys or ""
        keys = [part.strip() for part in raw.split(",") if part.strip()]
        if not keys:
            single = (self.ai_api_key or "").strip()
            keys = [single] if single else []
        return keys

    @property
    def model_list(self) -> list[str]:
        """Цепочка моделей: основная ``AI_MODEL``, затем ``AI_MODEL_FALLBACKS``."""
        models: list[str] = []
        primary = (self.ai_model or "").strip()
        if primary:
            models.append(primary)
        for part in (self.ai_model_fallbacks or "").split(","):
            name = part.strip()
            if name and name not in models:
                models.append(name)
        return models

    @property
    def ai_enabled(self) -> bool:
        """Есть ли реальный провайдер (не офлайн)."""
        provider = (self.ai_provider or "auto").lower()
        if provider == "offline":
            return False
        if provider == "ollama":
            return True
        return bool(self.api_key_list)


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

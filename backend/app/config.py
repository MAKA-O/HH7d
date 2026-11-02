"""Настройки приложения (переменные окружения / backend/.env)."""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent  # .../backend


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
    # auto | openai | ollama | offline
    #   auto     — если задан AI_API_KEY, работаем через OpenAI-совместимый API,
    #              иначе используем локальный офлайн-движок;
    #   openai   — OpenAI / OpenRouter / DeepSeek / VseGPT и любой совместимый API;
    #   ollama   — локальный сервер Ollama (http://localhost:11434/v1);
    #   offline  — принудительно встроенный офлайн-движок (демо без ключа).
    ai_provider: str = "auto"
    ai_base_url: str = "https://api.openai.com/v1"
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

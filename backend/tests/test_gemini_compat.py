"""Совместимость с Gemini через OpenAI-шлюз (без реального ключа).

Проверяем:
* автоподстановку адреса и модели при ``AI_PROVIDER=gemini``;
* health-check, который не падает, если провайдер не поддерживает ``GET /models``
  (так ведёт себя OpenAI-совместимый шлюз Gemini) — тогда используется chat-запрос;
* проброс ключа в заголовок Authorization.
"""
import json

import httpx
import pytest

from app.ai.providers import LLMClient
from app.config import GEMINI_BASE_URL, GEMINI_DEFAULT_MODEL, Settings


@pytest.fixture
def gemini_provider(monkeypatch):
    """Считать провайдера настроенным независимо от .env тестового окружения."""
    monkeypatch.setattr(LLMClient, "configured", property(lambda self: True))


def _client(base_url: str, handler) -> tuple[LLMClient, httpx.Client]:
    client = LLMClient(
        base_url=base_url,
        api_key="AIza-test-key",
        model=GEMINI_DEFAULT_MODEL,
        timeout=5.0,
        max_retries=0,
    )
    transport = httpx.MockTransport(handler)
    return client, httpx.Client(transport=transport)


def test_gemini_provider_defaults():
    settings = Settings(ai_provider="gemini", ai_api_key="AIza-test-key")
    assert settings.ai_base_url == GEMINI_BASE_URL
    assert settings.ai_model == GEMINI_DEFAULT_MODEL
    assert settings.ai_enabled is True


def test_explicit_gemini_base_url_is_respected():
    custom = "https://my-gateway.example/v1beta/openai"
    settings = Settings(ai_provider="gemini", ai_api_key="AIza-test-key", ai_base_url=custom)
    assert settings.ai_base_url == custom
    assert settings.ai_model == GEMINI_DEFAULT_MODEL


def test_offline_without_key_keeps_offline_mode():
    settings = Settings(ai_provider="gemini", ai_api_key="")
    assert settings.ai_enabled is False


def test_ping_falls_back_to_chat_when_models_unsupported(gemini_provider, monkeypatch):
    seen_paths: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen_paths.append(request.url.path)
        if request.url.path.endswith("/models"):
            return httpx.Response(404, json={"error": {"message": "Not Found"}})
        payload = json.loads(request.content)
        assert payload["model"] == GEMINI_DEFAULT_MODEL
        return httpx.Response(
            200,
            json={"choices": [{"message": {"role": "assistant", "content": "pong"}}]},
        )

    client, http_client = _client(GEMINI_BASE_URL, handler)
    monkeypatch.setattr(client, "_http", lambda: http_client)
    ok, message = client.ping(use_cache=False)
    assert ok is True, message
    assert "chat" in message.lower()
    assert any(path.endswith("/models") for path in seen_paths)
    assert any(path.endswith("/chat/completions") for path in seen_paths)


def test_ping_uses_models_when_supported(gemini_provider, monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["Authorization"] == "Bearer AIza-test-key"
        return httpx.Response(
            200,
            json={"object": "list", "data": [{"id": "gemini-3.8-flash", "object": "model"}]},
        )

    client, http_client = _client(GEMINI_BASE_URL, handler)
    monkeypatch.setattr(client, "_http", lambda: http_client)
    ok, message = client.ping(use_cache=False)
    assert ok is True
    assert message == "Модель отвечает"


def test_ping_reports_failure_when_provider_unreachable(gemini_provider, monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"error": {"message": "server error"}})

    client, http_client = _client(GEMINI_BASE_URL, handler)
    monkeypatch.setattr(client, "_http", lambda: http_client)
    ok, message = client.ping(use_cache=False)
    assert ok is False
    assert "недоступен" in message.lower()


def test_chat_parses_gemini_openai_response(gemini_provider, monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "id": "chatcmpl-1",
                "choices": [
                    {
                        "index": 0,
                        "message": {"role": "assistant", "content": "Индекс — это B-tree."},
                        "finish_reason": "stop",
                    }
                ],
            },
        )

    client, http_client = _client(GEMINI_BASE_URL, handler)
    monkeypatch.setattr(client, "_http", lambda: http_client)
    assert client.chat([{"role": "user", "content": "Что такое индекс?"}]) == "Индекс — это B-tree."

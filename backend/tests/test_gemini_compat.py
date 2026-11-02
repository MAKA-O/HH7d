"""Совместимость с Gemini через OpenAI-шлюз (без реального ключа).

Проверяем:
* автоподстановку адреса и модели при ``AI_PROVIDER=gemini``;
* health-check, который не падает, если провайдер не поддерживает ``GET /models``
  (так ведёт себя OpenAI-совместимый шлюз Gemini) — тогда используется chat-запрос;
* проброс ключа в заголовок Authorization.
"""
import json
import time

import httpx
import pytest

from app.ai.providers import LLMClient, LLMError
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
    # Режим «размышления» по умолчанию не передаётся: не все модели его принимают
    assert settings.ai_reasoning_effort == ""
    # Быстрый отказ вместо долгого ожидания
    assert settings.ai_timeout_sec <= 60
    assert settings.ai_max_retries <= 1


def test_reasoning_effort_can_be_overridden():
    settings = Settings(
        ai_provider="gemini", ai_api_key="AIza-test-key", ai_reasoning_effort="none"
    )
    assert settings.ai_reasoning_effort == "none"


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
    assert message.startswith("Модель отвечает")
    assert any(path.endswith("/models") for path in seen_paths)
    assert any(path.endswith("/chat/completions") for path in seen_paths)


def test_ping_uses_models_when_supported(gemini_provider, monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["Authorization"] == "Bearer AIza-test-key"
        if request.url.path.endswith("/models"):
            return httpx.Response(
                200,
                json={"object": "list", "data": [{"id": "gemini-3.5-flash-lite", "object": "model"}]},
            )
        return httpx.Response(
            200, json={"choices": [{"message": {"role": "assistant", "content": "pong"}}]}
        )

    client, http_client = _client(GEMINI_BASE_URL, handler)
    monkeypatch.setattr(client, "_http", lambda: http_client)
    ok, message = client.ping(use_cache=False)
    assert ok is True
    assert message.startswith("Модель отвечает")
    assert client.last_ping_ms is not None and client.last_ping_ms >= 0


def test_ping_reports_failure_when_provider_unreachable(gemini_provider, monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"error": {"message": "server error"}})

    client, http_client = _client(GEMINI_BASE_URL, handler)
    monkeypatch.setattr(client, "_http", lambda: http_client)
    ok, message = client.ping(use_cache=False)
    assert ok is False
    assert "недоступ" in message.lower()


def test_quota_429_fails_fast_without_retries(gemini_provider, monkeypatch):
    """Исчерпанная квота (429) не должна повторяться — сразу отдаём ошибку."""
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.path)
        return httpx.Response(
            429,
            json={"error": {"message": "You exceeded your current quota, check billing"}},
        )

    client, http_client = _client(GEMINI_BASE_URL, handler)
    monkeypatch.setattr(client, "_http", lambda: http_client)
    started = time.monotonic()
    with pytest.raises(LLMError) as excinfo:
        client.chat([{"role": "user", "content": "ping"}])
    elapsed = time.monotonic() - started
    assert len(calls) == 1, f"лишние повторы: {calls}"
    assert elapsed < 2.0, f"слишком долго: {elapsed:.2f} с"
    assert "Лимит" in str(excinfo.value)


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


def test_reasoning_effort_is_sent_and_can_be_dropped(gemini_provider, monkeypatch):
    """reasoning_effort передаётся, а при HTTP 400 запрос повторяется без него."""
    payloads: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        payloads.append(payload)
        if "reasoning_effort" in payload:
            return httpx.Response(400, json={"error": {"message": "unknown field"}})
        return httpx.Response(
            200, json={"choices": [{"message": {"role": "assistant", "content": "ok"}}]}
        )

    client = LLMClient(
        base_url=GEMINI_BASE_URL,
        api_key="AIza-test-key",
        model=GEMINI_DEFAULT_MODEL,
        timeout=5.0,
        max_retries=0,
        reasoning_effort="minimal",
    )
    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(client, "_http", lambda: httpx.Client(transport=transport))

    assert client.chat([{"role": "user", "content": "ping"}]) == "ok"
    assert payloads[0]["reasoning_effort"] == "minimal"
    assert "reasoning_effort" not in payloads[1]
    assert len(payloads) == 2


def test_reasoning_effort_not_sent_when_empty(gemini_provider, monkeypatch):
    payloads: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        payloads.append(json.loads(request.content))
        return httpx.Response(
            200, json={"choices": [{"message": {"role": "assistant", "content": "ok"}}]}
        )

    client = LLMClient(
        base_url=GEMINI_BASE_URL,
        api_key="AIza-test-key",
        model=GEMINI_DEFAULT_MODEL,
        timeout=5.0,
        max_retries=0,
        reasoning_effort="",
    )
    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(client, "_http", lambda: httpx.Client(transport=transport))
    client.chat([{"role": "user", "content": "ping"}])
    assert "reasoning_effort" not in payloads[0]

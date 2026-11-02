"""Тесты перебора резервных моделей и нескольких API-ключей.

Используется ``httpx.MockTransport`` — реальная сеть не нужна. Время в тестах
cooldown-ов подменяется ``FakeClock`` (инъекция ``time_source``), поэтому
тесты не спят по 15 минут и проверяют окна детерминированно.
"""
from __future__ import annotations

import json
import time

import httpx
import pytest

from app.ai.providers import LLMClient, LLMError

BASE_URL = "https://llm.example/v1"


# --------------------------------------------------------------- помощники
def _chat_ok(text: str) -> httpx.Response:
    return httpx.Response(
        200,
        json={"choices": [{"message": {"role": "assistant", "content": text}}]},
    )


def _quota_429() -> httpx.Response:
    return httpx.Response(
        429,
        json={
            "error": {
                "message": "You exceeded your current quota, please check your plan and billing details",
                "status": "RESOURCE_EXHAUSTED",
            }
        },
    )


def _model_404() -> httpx.Response:
    return httpx.Response(
        404,
        json={"error": {"message": "This model models/gemini-2.5-flash-lite is not found"}},
    )


def _busy_503() -> httpx.Response:
    return httpx.Response(
        503,
        json={"error": {"message": "This model is currently experiencing high demand"}},
    )


def _request_payload(request: httpx.Request) -> dict:
    return json.loads(request.content or b"{}")


def make_client(
    handler,
    *,
    keys: tuple[str, ...] = ("key-0",),
    models: tuple[str, ...] = ("model-a",),
    **kwargs,
) -> tuple[LLMClient, httpx.Client]:
    """Собирает клиент с MockTransport вместо реальной сети."""
    options = {
        "base_url": BASE_URL,
        "api_keys": list(keys),
        "models": list(models),
        "timeout": 2.0,
        "max_retries": 0,
        "quota_cooldown_sec": 900,
        "key_cooldown_sec": 3600,
        "model_cooldown_sec": 3600,
    }
    options.update(kwargs)
    client = LLMClient(**options)
    http_client = httpx.Client(
        transport=httpx.MockTransport(handler), timeout=2.0
    )
    client._http = lambda: http_client  # type: ignore[method-assign]
    return client, http_client


@pytest.fixture()
def provider_configured(monkeypatch):
    """Считать провайдера настроенным (в тестах AI_PROVIDER=offline)."""
    monkeypatch.setattr(LLMClient, "configured", property(lambda self: True))


class FakeClock:
    """Управляемое монотонное время для проверки cooldown-ов."""

    def __init__(self, start: float = 1000.0) -> None:
        self.value = float(start)

    def __call__(self) -> float:
        return self.value

    def advance(self, seconds: float) -> None:
        self.value += seconds


# ------------------------------------------------------------------- тесты
def test_quota_429_on_first_model_switches_to_second_model() -> None:
    """429 по квоте на основной модели → запрос уходит на резервную модель."""
    calls: list[tuple[str, str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        payload = _request_payload(request)
        calls.append((request.headers.get("Authorization", ""), payload["model"]))
        if payload["model"] == "model-a":
            return _quota_429()
        return _chat_ok("ответ с резервной модели")

    client, _ = make_client(
        handler, keys=("key-A", "key-B"), models=("model-a", "model-b")
    )

    answer = client.chat([{"role": "user", "content": "ping"}])

    assert answer == "ответ с резервной модели"
    # Сначала оба ключа для основной модели, затем первый ключ резервной.
    assert [model for _, model in calls] == ["model-a", "model-a", "model-b"]
    assert client.model == "model-b"
    assert client.active_key_index == 0
    assert client.active_pair == (0, "model-b")


def test_quota_429_on_first_key_repeats_with_second_key() -> None:
    """429 по квоте на первом ключе → тот же запрос повторяется вторым ключом."""
    authorizations: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        authorization = request.headers.get("Authorization", "")
        authorizations.append(authorization)
        if authorization == "Bearer key-A":
            return _quota_429()
        return _chat_ok("ok со второго ключа")

    client, _ = make_client(handler, keys=("key-A", "key-B"), models=("model-a",))

    answer = client.chat([{"role": "user", "content": "ping"}])

    assert answer == "ok со второго ключа"
    assert authorizations == ["Bearer key-A", "Bearer key-B"]
    assert client.active_key_index == 1
    assert client.model == "model-a"
    # Второй ключ активен — следующая команда идёт сразу с него.
    authorizations.clear()
    assert client.chat([{"role": "user", "content": "ping"}]) == "ok со второго ключа"
    assert authorizations == ["Bearer key-B"]


def test_model_404_switches_to_next_model() -> None:
    """404 «model not found» → переключение на следующую модель.

    404 относится к модели, поэтому она «остывает» для всех ключей сразу:
    второй ключ для несуществующей модели не тратится.
    """
    models_seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        payload = _request_payload(request)
        models_seen.append(payload["model"])
        if payload["model"] == "model-a":
            return _model_404()
        return _chat_ok("ok с рабочей модели")

    client, _ = make_client(
        handler, keys=("key-A", "key-B"), models=("model-a", "model-b")
    )

    assert client.chat([{"role": "user", "content": "ping"}]) == "ok с рабочей модели"
    assert models_seen == ["model-a", "model-b"]
    assert client.model == "model-b"

    # Модель model-a в cooldown и больше не дёргается.
    models_seen.clear()
    assert client.chat([{"role": "user", "content": "ping"}]) == "ok с рабочей модели"
    assert models_seen == ["model-b"]


def test_all_candidates_exhausted_fails_fast() -> None:
    """Все связки исчерпаны → LLMError быстро; следующий вызов без сети."""
    calls: list[tuple[str, str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        payload = _request_payload(request)
        calls.append((request.headers.get("Authorization", ""), payload["model"]))
        return _quota_429()

    client, _ = make_client(
        handler, keys=("key-A", "key-B"), models=("model-a", "model-b")
    )

    started = time.monotonic()
    with pytest.raises(LLMError) as excinfo:
        client.chat([{"role": "user", "content": "ping"}])
    elapsed = time.monotonic() - started

    assert elapsed < 2.0, f"перебор занял {elapsed:.2f} с"
    assert "Лимит" in str(excinfo.value)
    # Каждый кандидат попробован ровно один раз (без долгих повторов).
    assert len(calls) == 4

    # Пока cooldown-ы активны — мгновенный отказ без сетевых попыток.
    started = time.monotonic()
    with pytest.raises(LLMError) as second:
        client.chat([{"role": "user", "content": "ping"}])
    assert time.monotonic() - started < 0.5
    assert len(calls) == 4, "все связки в cooldown — сетевых попыток быть не должно"
    assert "недоступны" in str(second.value)


def test_last_successful_pair_is_promoted() -> None:
    """Последняя успешная связка следующей командой используется первой."""
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        payload = _request_payload(request)
        calls.append(payload["model"])
        if payload["model"] == "model-a":
            return _quota_429()
        return _chat_ok("ok")

    client, _ = make_client(
        handler, keys=("key-A",), models=("model-a", "model-b")
    )

    assert client.chat([{"role": "user", "content": "ping"}]) == "ok"
    assert calls == ["model-a", "model-b"]
    assert client.active_pair == (0, "model-b")

    calls.clear()
    assert client.chat([{"role": "user", "content": "ping"}]) == "ok"
    assert calls == ["model-b"], "активная связка должна быть первой в переборе"


def test_cooldown_is_respected_and_expires_on_time() -> None:
    """Cooldown не сбрасывается раньше времени и истекает по таймеру."""
    clock = FakeClock()
    calls: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(1)
        return _quota_429()

    client, _ = make_client(
        handler, keys=("key-A",), models=("model-a",), time_source=clock
    )

    with pytest.raises(LLMError):
        client.chat([{"role": "user", "content": "ping"}])
    assert len(calls) == 1

    # 899 из 900 секунд прошло — связка ещё «остывает», сеть не трогаем.
    clock.advance(899)
    with pytest.raises(LLMError) as excinfo:
        client.chat([{"role": "user", "content": "ping"}])
    assert len(calls) == 1
    assert "~1 с" in str(excinfo.value)

    # Ещё 2 секунды — cooldown истёк, связка снова доступна.
    clock.advance(2)

    def ok_handler(request: httpx.Request) -> httpx.Response:
        calls.append(1)
        return _chat_ok("после cooldown")

    client._http = lambda: httpx.Client(transport=httpx.MockTransport(ok_handler))
    assert client.chat([{"role": "user", "content": "ping"}]) == "после cooldown"
    assert len(calls) == 2


def test_400_param_is_dropped_and_request_retried() -> None:
    """400 про необязательный параметр → повтор без параметра, а не cooldown."""
    payloads: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        payload = _request_payload(request)
        payloads.append(payload)
        if "reasoning_effort" in payload:
            return httpx.Response(400, json={"error": {"message": "unknown field reasoning_effort"}})
        return _chat_ok("ok")

    client, _ = make_client(
        handler, keys=("key-A",), models=("model-a",), reasoning_effort="minimal"
    )

    assert client.chat([{"role": "user", "content": "ping"}]) == "ok"
    assert payloads[0]["reasoning_effort"] == "minimal"
    assert "reasoning_effort" not in payloads[1]
    assert len(payloads) == 2


def test_400_model_specific_is_treated_as_model_problem() -> None:
    """400 «Thinking level ... is not supported for this model» → следующая модель."""
    models_seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        payload = _request_payload(request)
        models_seen.append(payload["model"])
        if payload["model"] == "model-a":
            return httpx.Response(
                400,
                json={
                    "error": {
                        "message": "Thinking level MINIMAL is not supported for this model"
                    }
                },
            )
        return _chat_ok("ok")

    client, _ = make_client(
        handler, keys=("key-A",), models=("model-a", "model-b")
    )

    assert client.chat([{"role": "user", "content": "ping"}]) == "ok"
    assert models_seen == ["model-a", "model-b"]


def test_503_high_demand_retries_same_pair_once_then_next_model() -> None:
    """503 «high demand»: одна повторная попытка, затем следующая модель."""
    models_seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        payload = _request_payload(request)
        models_seen.append(payload["model"])
        if payload["model"] == "model-a":
            return _busy_503()
        return _chat_ok("ok")

    client, _ = make_client(
        handler, keys=("key-A",), models=("model-a", "model-b")
    )

    assert client.chat([{"role": "user", "content": "ping"}]) == "ok"
    assert models_seen == ["model-a", "model-a", "model-b"]


def test_chat_stream_switches_model_on_error_before_first_token() -> None:
    """Ошибка стрима до первого токена → следующий кандидат; токены склеиваются."""
    models_seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        payload = _request_payload(request)
        models_seen.append(payload["model"])
        if payload["model"] == "model-a":
            return _quota_429()
        body = (
            'data: {"choices": [{"delta": {"content": "ответ "}}]}\n\n'
            'data: {"choices": [{"delta": {"content": "стримом"}}]}\n\n'
            "data: [DONE]\n\n"
        )
        return httpx.Response(
            200, headers={"content-type": "text/event-stream"}, content=body
        )

    client, _ = make_client(
        handler, keys=("key-A",), models=("model-a", "model-b")
    )

    chunks = list(client.chat_stream([{"role": "user", "content": "ping"}]))
    assert "".join(chunks) == "ответ стримом"
    assert models_seen == ["model-a", "model-b"]


def test_settings_build_key_list_and_model_chain() -> None:
    """Конфиг: AI_API_KEYS важнее AI_API_KEY, цепочка моделей без дублей."""
    from app.config import Settings

    settings = Settings(
        ai_provider="gemini",
        ai_api_key="legacy-key",
        ai_api_keys="key-project-1, key-project-2",
        ai_model="model-main",
        ai_model_fallbacks="model-backup, model-third, model-backup",
    )
    assert settings.api_key_list == ["key-project-1", "key-project-2"]
    assert settings.model_list == ["model-main", "model-backup", "model-third"]
    assert settings.ai_enabled is True
    assert settings.ai_quota_cooldown_sec == 900
    assert settings.ai_key_cooldown_sec == 3600
    assert settings.ai_model_cooldown_sec == 3600

    # Обратная совместимость: пусто AI_API_KEYS → одиночный AI_API_KEY.
    fallback = Settings(
        ai_provider="gemini",
        ai_api_key="legacy-key",
        ai_api_keys="",
        ai_model_fallbacks="",
    )
    assert fallback.api_key_list == ["legacy-key"]
    assert fallback.model_list == ["gemini-3.5-flash-lite"]
    assert fallback.ai_enabled is True

    # Только новые ключи, старый пуст — live-режим всё равно включается.
    only_new = Settings(ai_provider="gemini", ai_api_key="", ai_api_keys="key-project-1")
    assert only_new.ai_enabled is True

    # Офлайн-режим важнее любых ключей.
    offline = Settings(ai_provider="offline", ai_api_keys="key-project-1")
    assert offline.ai_enabled is False
    assert LLMClient(api_keys=["key-project-1"], models=["model-main"]).models == ["model-main"]


def test_client_uses_multiple_keys_from_constructor() -> None:
    """Клиент принимает список ключей/моделей и перебирает их в нужном порядке."""
    client = LLMClient(
        base_url=BASE_URL,
        api_keys=["key-project-1", "key-project-2"],
        models=["model-main", "model-backup"],
        timeout=1.0,
        max_retries=0,
    )
    pairs = client._candidate_pairs()
    assert pairs == [
        (0, "model-main"),
        (1, "model-main"),
        (0, "model-backup"),
        (1, "model-backup"),
    ]
    assert client.model == "model-main"
    assert client.active_key_index is None
    assert client.key_number == 1


def test_ping_message_contains_active_model_and_key(provider_configured) -> None:
    """Health-сообщение показывает активную связку «модель + ключ»."""
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/models"):
            # Gemini-шлюз не поддерживает /models — ping проверит chat-запросом.
            return httpx.Response(404, json={"error": {"message": "Not Found"}})
        return _chat_ok("pong")

    client, _ = make_client(handler, keys=("key-A",), models=("model-a",))

    ok, message = client.ping(use_cache=False)

    assert ok is True
    assert message.startswith("Модель отвечает")
    assert "model-a" in message
    assert "ключ 1" in message
    assert client.last_ping_ms is not None and client.last_ping_ms >= 0
    # 404 на /models не должен «замораживать» модель: chat уже сработал.
    assert client.model == "model-a"

"""Низкоуровневый клиент OpenAI-совместимого HTTP API.

Поддерживаются OpenAI, OpenRouter, DeepSeek, VseGPT, локальная Ollama и любой
другой сервер с совместимым протоколом (адрес задаётся ``AI_BASE_URL``):

* ``POST {base_url}/chat/completions`` — обычный и потоковый (SSE) ответ;
* ``response_format={"type": "json_object"}`` — JSON-режим (с мягким fallback
  для серверов, которые его не принимают);
* ``GET {base_url}/models`` — фактический health-check провайдера;
* ``POST {base_url}/audio/transcriptions`` — распознавание речи (Whisper).

Таймауты и повторные попытки настраиваются через ``app.config``
(``AI_TIMEOUT_SEC``, ``AI_MAX_RETRIES``). Модуль не зависит от FastAPI и
используется только ``LiveEngine``; при работе в офлайн-режиме не загружается.
"""
from __future__ import annotations

import json
import logging
import re
import time
from collections.abc import Iterator
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# Модель распознавания речи OpenAI-совместимого API.
DEFAULT_TRANSCRIPTION_MODEL = "whisper-1"

# HTTP-статусы, при которых имеет смысл повторить запрос.
RETRYABLE_STATUSES = frozenset({408, 409, 425, 429, 500, 502, 503, 504})


class LLMError(RuntimeError):
    """Любая ошибка взаимодействия с LLM-провайдером."""


# --------------------------------------------------------------------- JSON
def extract_json(text: str) -> Any:
    """Достаёт JSON из ответа модели (в т.ч. из ```json ... ``` блоков).

    :raises ValueError: если валидный JSON в ответе не найден.
    """
    if not text or not str(text).strip():
        raise ValueError("Модель вернула пустой ответ")
    cleaned = str(text).strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```[a-zA-Z0-9_-]*\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    for opening, closing in (("{", "}"), ("[", "]")):
        start = cleaned.find(opening)
        end = cleaned.rfind(closing)
        if start != -1 and end > start:
            try:
                return json.loads(cleaned[start : end + 1])
            except json.JSONDecodeError:
                continue
    raise ValueError("В ответе модели не найден валидный JSON")


def extract_json_object(text: str) -> dict[str, Any]:
    """Достаёт JSON-объект; массив верхнего уровня оборачивается в ``{"items": [...]}``."""
    data = extract_json(text)
    if isinstance(data, dict):
        return data
    if isinstance(data, list):
        return {"items": data}
    raise ValueError("Ожидался JSON-объект, а получено значение другого типа")


# ------------------------------------------------------------------- клиент
class LLMClient:
    """Синхронный клиент OpenAI-совместимого API с таймаутами и ретраями."""

    def __init__(
        self,
        *,
        base_url: str | None = None,
        api_key: str | None = None,
        model: str | None = None,
        temperature: float | None = None,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: dict[str, str] | None = None,
        transcription_model: str | None = None,
    ) -> None:
        self.base_url = (base_url if base_url is not None else settings.ai_base_url).strip().rstrip("/")
        self.api_key = (api_key if api_key is not None else settings.ai_api_key).strip()
        self.model = (model if model is not None else settings.ai_model).strip()
        self.temperature = float(
            settings.ai_temperature if temperature is None else temperature
        )
        self.timeout = float(settings.ai_timeout_sec if timeout is None else timeout)
        self.max_retries = max(0, int(settings.ai_max_retries if max_retries is None else max_retries))
        self.extra_headers = dict(settings.ai_extra_headers if extra_headers is None else extra_headers)
        self.transcription_model = transcription_model or DEFAULT_TRANSCRIPTION_MODEL
        self._client: httpx.Client | None = None
        # Без ключа API работают только локальные серверы (Ollama).
        self._key_optional = (settings.ai_provider or "auto").lower() == "ollama"
        # Кэш результата health-проверки, чтобы опросы UI не тратили токены.
        self._ping_cache: tuple[float, tuple[bool, str]] | None = None
        self._ping_ttl_sec = 60.0

    # ----------------------------------------------------------- настройки
    @property
    def configured(self) -> bool:
        """Настроен ли провайдер (для Ollama ключ не обязателен)."""
        provider = (settings.ai_provider or "auto").lower()
        if provider == "offline":
            return False
        if provider == "ollama":
            return True
        return bool(self.api_key)

    def close(self) -> None:
        """Закрывает внутренний пул HTTP-соединений."""
        if self._client is not None:
            self._client.close()
            self._client = None

    # ------------------------------------------------------------- служебное
    def _http(self) -> httpx.Client:
        if self._client is None:
            self._client = httpx.Client(
                timeout=self._make_timeout(self.timeout),
                follow_redirects=True,
                headers={"User-Agent": "interview-trainer/1.0"},
            )
        return self._client

    @staticmethod
    def _make_timeout(value: float) -> httpx.Timeout:
        seconds = max(1.0, float(value))
        return httpx.Timeout(seconds, connect=min(seconds, 10.0))

    def _headers(self, *, stream: bool = False) -> dict[str, str]:
        headers = dict(self.extra_headers)
        headers.setdefault("Accept", "text/event-stream" if stream else "application/json")
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    @staticmethod
    def _backoff(attempt: int) -> float:
        return min(0.6 * (2**attempt), 3.0)

    def _request(
        self,
        method: str,
        path: str,
        *,
        json_body: dict[str, Any] | None = None,
        data: dict[str, Any] | None = None,
        files: dict[str, Any] | None = None,
        timeout: float | None = None,
    ) -> httpx.Response:
        """HTTP-запрос с повторами на сетевые ошибки и 429/5xx."""
        url = f"{self.base_url}{path}"
        attempts = self.max_retries + 1
        last_error = "нет попыток"
        for attempt in range(attempts):
            try:
                response = self._http().request(
                    method,
                    url,
                    json=json_body,
                    data=data,
                    files=files,
                    headers=self._headers(),
                    timeout=self._make_timeout(timeout if timeout is not None else self.timeout),
                )
            except httpx.HTTPError as exc:
                last_error = f"сетевая ошибка: {exc}"
                logger.warning(
                    "LLM-запрос %s %s не удался (попытка %d/%d): %s",
                    method,
                    path,
                    attempt + 1,
                    attempts,
                    exc,
                )
                if attempt < attempts - 1:
                    time.sleep(self._backoff(attempt))
                    continue
                raise LLMError(
                    f"Не удалось связаться с LLM-провайдером ({self.base_url}): {exc}"
                ) from exc
            if response.status_code in RETRYABLE_STATUSES and attempt < attempts - 1:
                last_error = f"HTTP {response.status_code}"
                snippet = response.text[:200].replace("\n", " ")
                logger.warning(
                    "LLM-провайдер ответил %s (попытка %d/%d): %s",
                    response.status_code,
                    attempt + 1,
                    attempts,
                    snippet,
                )
                response.close()
                time.sleep(self._backoff(attempt))
                continue
            if response.status_code >= 400:
                snippet = response.text[:400].replace("\n", " ")
                raise LLMError(f"LLM-провайдер вернул HTTP {response.status_code}: {snippet}")
            return response
        raise LLMError(f"LLM-провайдер недоступен: {last_error}")

    def _post_json(self, path: str, payload: dict[str, Any], *, timeout: float | None = None) -> dict[str, Any]:
        response = self._request("POST", path, json_body=payload, timeout=timeout)
        try:
            data = response.json()
        except ValueError as exc:
            raise LLMError("Провайдер вернул не-JSON ответ") from exc
        if not isinstance(data, dict):
            raise LLMError("Провайдер вернул неожиданный формат ответа")
        error = data.get("error")
        if error:
            message = error.get("message") if isinstance(error, dict) else str(error)
            raise LLMError(f"Ошибка LLM-провайдера: {message}")
        return data

    # --------------------------------------------------------------- chat
    @staticmethod
    def _extract_message_text(data: dict[str, Any]) -> str:
        choices = data.get("choices")
        if not isinstance(choices, list) or not choices:
            raise LLMError("Модель вернула пустой список вариантов ответа")
        first = choices[0] if isinstance(choices[0], dict) else {}
        message = first.get("message") if isinstance(first.get("message"), dict) else {}
        content = message.get("content")
        if isinstance(content, list):
            content = "".join(
                str(part.get("text", ""))
                for part in content
                if isinstance(part, dict)
            )
        text = str(content or "").strip()
        if not text:
            raise LLMError("Модель вернула пустой ответ")
        return text

    def _chat_payload(
        self,
        messages: list[dict[str, str]],
        *,
        json_mode: bool,
        temperature: float | None,
        max_tokens: int | None,
        stream: bool,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": [dict(item) for item in messages],
            "temperature": float(self.temperature if temperature is None else temperature),
            "stream": stream,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        if max_tokens:
            payload["max_tokens"] = int(max_tokens)
        return payload

    def chat(
        self,
        messages: list[dict[str, str]],
        *,
        json_mode: bool = False,
        temperature: float | None = None,
        max_tokens: int | None = None,
        timeout: float | None = None,
    ) -> str:
        """Один запрос к модели; возвращает текст ответа."""
        payload = self._chat_payload(
            messages,
            json_mode=json_mode,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=False,
        )
        try:
            data = self._post_json("/chat/completions", payload, timeout=timeout)
            return self._extract_message_text(data)
        except LLMError as exc:
            # Некоторые локальные серверы не поддерживают response_format.
            if not (json_mode and ("HTTP 400" in str(exc) or "HTTP 422" in str(exc))):
                raise
            logger.info("Провайдер не принял response_format, повторяю без JSON-режима")
            payload.pop("response_format", None)
            data = self._post_json("/chat/completions", payload, timeout=timeout)
            return self._extract_message_text(data)

    def chat_stream(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float | None = None,
        timeout: float | None = None,
    ) -> Iterator[str]:
        """Потоковые дельты ответа (SSE, формат OpenAI ``data: {...}``)."""
        payload = self._chat_payload(
            messages,
            json_mode=False,
            temperature=temperature,
            max_tokens=None,
            stream=True,
        )
        url = f"{self.base_url}/chat/completions"
        attempts = self.max_retries + 1
        for attempt in range(attempts):
            received = False
            try:
                with self._http().stream(
                    "POST",
                    url,
                    json=payload,
                    headers=self._headers(stream=True),
                    timeout=self._make_timeout(timeout if timeout is not None else self.timeout),
                ) as response:
                    if response.status_code >= 400:
                        body = response.read().decode("utf-8", errors="replace")[:300]
                        raise LLMError(
                            f"LLM-провайдер вернул HTTP {response.status_code}: {body}"
                        )
                    for piece in _iter_sse_deltas(response):
                        received = True
                        yield piece
                if not received:
                    raise LLMError("Модель не вернула потоковый ответ")
                return
            except LLMError:
                if received or attempt >= attempts - 1:
                    raise
                time.sleep(self._backoff(attempt))
            except httpx.HTTPError as exc:
                if received or attempt >= attempts - 1:
                    raise LLMError(f"Поток LLM прервался: {exc}") from exc
                time.sleep(self._backoff(attempt))

    # --------------------------------------------------------------- health
    def list_models(self, *, timeout: float | None = None) -> list[str]:
        """Список моделей провайдера (используется для health-check)."""
        response = self._request(
            "GET",
            "/models",
            timeout=timeout if timeout is not None else min(self.timeout, 10.0),
        )
        try:
            data = response.json()
        except ValueError as exc:
            raise LLMError("Провайдер вернул не-JSON ответ на /models") from exc
        if isinstance(data, dict):
            raw = data.get("data") or data.get("models") or []
        elif isinstance(data, list):
            raw = data
        else:
            raw = []
        models: list[str] = []
        for item in raw:
            if isinstance(item, dict):
                value = item.get("id") or item.get("name") or ""
            else:
                value = str(item)
            value = str(value).strip()
            if value:
                models.append(value)
        return models

    def ping(self, *, use_cache: bool = True) -> tuple[bool, str]:
        """Фактическая проверка доступности провайдера.

        Сначала пробуем ``GET /models``. Если провайдер его не поддерживает
        (так ведёт себя OpenAI-совместимый шлюз Gemini), проверяем минимальным
        chat-запросом. Результат кэшируется на минуту.
        """
        if not self.configured:
            return False, "Ключ API не задан — доступен только офлайн-режим"
        now = time.monotonic()
        if use_cache and self._ping_cache is not None:
            cached_at, cached_result = self._ping_cache
            if now - cached_at < self._ping_ttl_sec:
                return cached_result
        result = self._ping_uncached()
        self._ping_cache = (now, result)
        return result

    def _ping_uncached(self) -> tuple[bool, str]:
        try:
            models = self.list_models(timeout=min(max(self.timeout, 3.0), 10.0))
        except LLMError as exc:
            logger.info("Провайдер не отдал /models (%s), проверяю chat-запросом", exc)
            try:
                self.chat(
                    [{"role": "user", "content": "ping"}],
                    temperature=0.0,
                    timeout=min(max(self.timeout, 5.0), 20.0),
                )
            except LLMError as chat_exc:
                return False, f"LLM-провайдер недоступен: {chat_exc}"
            return True, "Модель отвечает (проверка chat-запросом: /models недоступен)"
        if models and self.model and not any(
            self.model == item or self.model in item for item in models
        ):
            return (
                True,
                f"Провайдер отвечает, но модель «{self.model}» отсутствует в списке /models",
            )
        return True, "Модель отвечает"

    # --------------------------------------------------------- транскрипция
    def transcribe(self, *, audio: bytes, filename: str, language: str | None = "ru") -> str:
        """Распознавание речи через ``/audio/transcriptions`` (Whisper)."""
        if not self.configured:
            raise LLMError("Провайдер распознавания речи не настроен")
        if not audio:
            raise LLMError("Пустой аудиофайл")
        safe_name = (filename or "audio.webm").strip() or "audio.webm"
        files = {"file": (safe_name, audio, "application/octet-stream")}
        form: dict[str, Any] = {"model": self.transcription_model}
        if language:
            form["language"] = language
        response = self._request(
            "POST",
            "/audio/transcriptions",
            data=form,
            files=files,
            timeout=min(self.timeout, 60.0),
        )
        try:
            data = response.json()
        except ValueError as exc:
            raise LLMError("Провайдер вернул не-JSON ответ на /audio/transcriptions") from exc
        text = str((data or {}).get("text") or "").strip() if isinstance(data, dict) else ""
        if not text:
            raise LLMError("Провайдер не распознал речь")
        return text


# -------------------------------------------------------------------- SSE
def _iter_sse_deltas(response: httpx.Response) -> Iterator[str]:
    """Разбирает SSE-поток OpenAI и отдаёт текстовые дельты."""
    for raw_line in response.iter_lines():
        line = raw_line.strip()
        if not line or line.startswith(":") or not line.startswith("data:"):
            continue
        payload = line[len("data:") :].strip()
        if not payload or payload == "[DONE]":
            break
        try:
            event = json.loads(payload)
        except json.JSONDecodeError:
            logger.debug("Пропускаю не-JSON событие SSE: %s", payload[:120])
            continue
        if not isinstance(event, dict):
            continue
        choices = event.get("choices")
        if isinstance(choices, list) and choices:
            choice = choices[0] if isinstance(choices[0], dict) else {}
            delta = choice.get("delta")
            if not isinstance(delta, dict):
                delta = choice.get("message") if isinstance(choice.get("message"), dict) else {}
            content = delta.get("content")
            if isinstance(content, str) and content:
                yield content
            elif isinstance(content, list):
                for part in content:
                    if isinstance(part, dict) and part.get("text"):
                        yield str(part["text"])

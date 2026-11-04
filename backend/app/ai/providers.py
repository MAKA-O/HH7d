"""Низкоуровневый клиент OpenAI-совместимого HTTP API.

Поддерживаются OpenAI, OpenRouter, DeepSeek, VseGPT, Google Gemini
(OpenAI-совместимый шлюз), локальная Ollama и любой другой совместимый сервер
(адрес задаётся ``AI_BASE_URL``):

* ``POST {base_url}/chat/completions`` — обычный и потоковый (SSE) ответ;
* ``response_format={"type": "json_object"}`` — JSON-режим (с мягким fallback
  для серверов, которые его не принимают);
* ``GET {base_url}/models`` — фактический health-check провайдера;
* ``POST {base_url}/audio/transcriptions`` — распознавание речи (Whisper).

Цепочка «ключ + модель»:
квота у Google/Gemini считается на **проект**, поэтому разные ключи из разных
проектов дают независимые лимиты. Клиент перебирает кандидатов в порядке
``[(key0, model0), (key1, model0), (key0, model1), (key1, model1), …]``:
сначала альтернативный ключ для той же модели, затем следующая модель.
Последняя успешная связка продвигается в начало, а неудачные связки получают
cooldown (429 — квота, 401/403 — ключ, 404/400 «модель» — модель), чтобы не
упираться в одни и те же ошибки. Если все связки «остывают», клиент сразу
поднимает ``LLMError`` без сетевых попыток — приложение мгновенно уходит в
офлайн-режим.

Модуль не зависит от FastAPI и используется только ``LiveEngine``; при работе
в офлайн-режиме не загружается.
"""
from __future__ import annotations

import json
import logging
import re
import time
from collections.abc import Callable, Iterator
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# Модель распознавания речи OpenAI-совместимого API.
DEFAULT_TRANSCRIPTION_MODEL = "whisper-1"

# Признаки исчерпанной квоты в теле ошибки (HTTP 429).
QUOTA_MARKERS = (
    "quota",
    "resource_exhausted",
    "exceeded your current quota",
    "billing",
    "rate limit",
    "rate_limit",
    "too many requests",
)

# Признаки того, что HTTP 400/404 относится к модели, а не к параметрам запроса.
MODEL_MARKERS = (
    "model not found",
    "models/",
    "model_not_found",
    "unknown model",
    "invalid model",
    "does not support",
    "not supported for this model",
    "not supported for model",
    "thinking level",
    "not available for",
    "is not found",
    "unsupported model",
)

# Признаки того, что HTTP 400 относится к необязательному параметру запроса.
PARAM_MARKERS = (
    "response_format",
    "reasoning_effort",
    "unknown field",
    "unknown name",
    "invalid argument",
    "unsupported parameter",
    "extra fields",
)

# Типы сбоев одной связки «ключ + модель».
FAILURE_QUOTA = "quota"
FAILURE_KEY = "key"
FAILURE_MODEL = "model"
FAILURE_OVERLOAD = "overload"
FAILURE_NETWORK = "network"
FAILURE_PARAM = "param"
FAILURE_ENDPOINT = "endpoint_missing"
FAILURE_OTHER = "other"


class LLMError(RuntimeError):
    """Любая ошибка взаимодействия с LLM-провайдером."""


class _CandidateError(Exception):
    """Сбой одной связки «ключ + модель» (внутренняя ошибка перебора)."""

    def __init__(self, kind: str, status: int, message: str) -> None:
        super().__init__(message)
        self.kind = kind
        self.status = status
        self.message = message

    def __str__(self) -> str:  # pragma: no cover - используется в логах
        return self.message


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


def _clean_list(values: Any) -> list[str]:
    """Список непустых уникальных строк из строки/списка."""
    if isinstance(values, str):
        raw: list[Any] = values.split(",")
    elif isinstance(values, (list, tuple)):
        raw = list(values)
    else:
        return []
    result: list[str] = []
    for item in raw:
        value = str(item or "").strip()
        if value and value not in result:
            result.append(value)
    return result


# ------------------------------------------------------------------- клиент
class LLMClient:
    """Синхронный клиент OpenAI-совместимого API с перебором ключей и моделей."""

    def __init__(
        self,
        *,
        base_url: str | None = None,
        api_key: str | None = None,
        api_keys: list[str] | str | None = None,
        model: str | None = None,
        models: list[str] | str | None = None,
        temperature: float | None = None,
        timeout: float | None = None,
        max_retries: int | None = None,
        extra_headers: dict[str, str] | None = None,
        transcription_model: str | None = None,
        reasoning_effort: str | None = None,
        quota_cooldown_sec: float | None = None,
        key_cooldown_sec: float | None = None,
        model_cooldown_sec: float | None = None,
        time_source: Callable[[], float] | None = None,
    ) -> None:
        self.base_url = (base_url if base_url is not None else settings.ai_base_url).strip().rstrip("/")
        # --- ключи: явные api_keys > одиночный api_key > настройки ---
        if api_keys is not None:
            keys = _clean_list(api_keys)
        elif api_key is not None:
            keys = [api_key.strip()] if api_key.strip() else []
        else:
            keys = list(settings.api_key_list)
        # --- модели: явные models > одиночная model > настройки ---
        if models is not None:
            model_names = _clean_list(models)
        elif model is not None:
            model_names = [model.strip()] if model.strip() else []
        else:
            model_names = list(settings.model_list)
        if not model_names:
            model_names = [(settings.ai_model or "gpt-4o-mini").strip()]

        provider = (settings.ai_provider or "auto").lower()
        self._key_optional = provider == "ollama"
        self._api_keys: list[str] = keys or ([""] if self._key_optional else [])
        self._models: list[str] = model_names

        # Обратная совместимость: старые поля-атрибуты.
        self.api_key = self._api_keys[0] if self._api_keys else ""

        self.temperature = float(settings.ai_temperature if temperature is None else temperature)
        self.timeout = float(settings.ai_timeout_sec if timeout is None else timeout)
        self.max_retries = max(0, int(settings.ai_max_retries if max_retries is None else max_retries))
        self.extra_headers = dict(settings.ai_extra_headers if extra_headers is None else extra_headers)
        self.transcription_model = transcription_model or DEFAULT_TRANSCRIPTION_MODEL
        self.reasoning_effort = (
            settings.ai_reasoning_effort if reasoning_effort is None else reasoning_effort
        ).strip()
        self.quota_cooldown_sec = float(
            settings.ai_quota_cooldown_sec if quota_cooldown_sec is None else quota_cooldown_sec
        )
        self.key_cooldown_sec = float(
            settings.ai_key_cooldown_sec if key_cooldown_sec is None else key_cooldown_sec
        )
        self.model_cooldown_sec = float(
            settings.ai_model_cooldown_sec if model_cooldown_sec is None else model_cooldown_sec
        )
        self._time_source = time_source

        self._client: httpx.Client | None = None
        # Последняя успешная связка (key_index, model) — продвигается в начало.
        self._active: tuple[int, str] | None = None
        # Cooldown-кеш: (key_index, model) -> until (monotonic).
        self._cooldowns: dict[tuple[int, str], float] = {}
        # Кэш результата health-проверки, чтобы опросы UI не тратили токены.
        self._ping_cache: tuple[float, tuple[bool, str], float | None] | None = None
        self._ping_ttl_sec = 300.0
        # Замер последней проверки — отдаётся в /api/ai/health.
        self.last_ping_ms: float | None = None
        # Параметры, которые провайдер уже отверг (чтобы не повторять 400 каждый раз).
        self._unsupported_params: set[str] = set()

    # ----------------------------------------------------------- настройки
    @property
    def configured(self) -> bool:
        """Настроен ли провайдер (для Ollama ключ не обязателен)."""
        provider = (settings.ai_provider or "auto").lower()
        if provider == "offline":
            return False
        if provider == "ollama":
            return True
        return bool([key for key in self._api_keys if key])

    @property
    def models(self) -> list[str]:
        """Цепочка моделей (основная, затем резервные) в порядке перебора."""
        return list(self._models)

    @property
    def api_keys(self) -> list[str]:
        """Список ключей (для диагностики; не логируется целиком)."""
        return list(self._api_keys)

    @property
    def model(self) -> str:
        """Активная модель (последняя успешная) или основная."""
        return self._active[1] if self._active else self._models[0]

    @property
    def active_key_index(self) -> int | None:
        """Индекс активного ключа (0-based) или None, если успехов ещё не было."""
        return self._active[0] if self._active else None

    @property
    def key_number(self) -> int:
        """Номер активного ключа для интерфейса (1-based)."""
        index = self.active_key_index
        return (index if index is not None else 0) + 1

    @property
    def active_pair(self) -> tuple[int, str] | None:
        """Активная связка (индекс ключа, модель)."""
        return self._active

    def close(self) -> None:
        """Закрывает внутренний пул HTTP-соединений."""
        if self._client is not None:
            self._client.close()
            self._client = None

    def _now(self) -> float:
        """Текущее монотонное время (можно подменить в тестах через time_source)."""
        if self._time_source is not None:
            return float(self._time_source())
        return time.monotonic()

    # --------------------------------------------------------- cooldown-ы
    def _candidate_pairs(self) -> list[tuple[int, str]]:
        """Все связки в порядке перебора с активной в начале."""
        pairs = [(key_index, model) for model in self._models for key_index in range(len(self._api_keys))]
        if self._active in pairs:
            pairs.remove(self._active)
            pairs.insert(0, self._active)
        return pairs

    def _cooldown_left(self, key_index: int, model: str) -> float:
        """Сколько секунд ещё «остывает» связка (0 — доступна)."""
        until = self._cooldowns.get((key_index, model), 0.0)
        return max(0.0, until - self._now())

    def _available_pairs(self) -> list[tuple[int, str]]:
        """Доступные связки; если все в cooldown — быстрый LLMError без сети."""
        pairs = self._candidate_pairs()
        if not pairs:
            raise LLMError(
                "Не настроены ключи API или модели LLM-провайдера "
                "(проверьте AI_API_KEY / AI_API_KEYS / AI_MODEL)"
            )
        now = self._now()
        available = [pair for pair in pairs if self._cooldowns.get(pair, 0.0) <= now]
        if available:
            return available
        wait = min(self._cooldowns.get(pair, now) for pair in pairs) - now
        raise LLMError(
            "Все связки «ключ + модель» временно недоступны (квоты/ошибки провайдера). "
            f"Ближайшее восстановление через ~{max(0.0, wait):.0f} с. "
            f"Модели: {', '.join(self._models)}; ключей: {max(1, len(self._api_keys))}."
        )

    def _register_success(self, key_index: int, model: str) -> None:
        """Запоминает активную связку и сбрасывает её cooldown."""
        changed = self._active != (key_index, model)
        self._active = (key_index, model)
        self._cooldowns.pop((key_index, model), None)
        # Health-кэш больше не актуален: активная связка могла измениться.
        self._ping_cache = None
        if changed:
            logger.info("LLM: активная связка — ключ #%d, модель %s", key_index + 1, model)

    def _register_failure(self, key_index: int, model: str, error: _CandidateError) -> None:
        """Ставит cooldown на связку/ключ/модель в зависимости от причины."""
        seconds = 0.0
        if error.kind == FAILURE_QUOTA:
            seconds = self.quota_cooldown_sec
        elif error.kind == FAILURE_KEY:
            seconds = self.key_cooldown_sec
        elif error.kind == FAILURE_MODEL:
            seconds = self.model_cooldown_sec

        if seconds <= 0:
            logger.warning(
                "LLM: связка «ключ #%d, модель %s» не сработала: %s",
                key_index + 1,
                model,
                error.message,
            )
            return

        # Health-кэш больше не актуален: провайдер ответил ошибкой.
        self._ping_cache = None
        until = self._now() + seconds
        if error.kind == FAILURE_KEY:
            # Ключ плохой для всех моделей.
            for item in self._models:
                self._cooldowns[(key_index, item)] = until
            message = f"ключ #%d в cooldown %.0f с" % (key_index + 1, seconds)
        elif error.kind == FAILURE_MODEL:
            # Модель недоступна для всех ключей.
            for index in range(len(self._api_keys)):
                self._cooldowns[(index, model)] = until
            message = f"модель %s в cooldown %.0f с" % (model, seconds)
        else:
            self._cooldowns[(key_index, model)] = until
            message = "связка «ключ #%d, модель %s» в cooldown %.0f с" % (
                key_index + 1,
                model,
                seconds,
            )
        logger.warning("LLM: %s: %s", message, error.message)

    # ----------------------------------------------------------- HTTP-слой
    def _http(self) -> httpx.Client:
        if self._client is None:
            self._client = httpx.Client(
                timeout=self._make_timeout(self.timeout),
                follow_redirects=True,
                headers={"User-Agent": "interview-trainer/1.1"},
            )
        return self._client

    @staticmethod
    def _make_timeout(value: float) -> httpx.Timeout:
        seconds = max(1.0, float(value))
        return httpx.Timeout(seconds, connect=min(seconds, 10.0))

    def _headers(self, key_index: int, *, stream: bool = False) -> dict[str, str]:
        headers = dict(self.extra_headers)
        headers.setdefault("Accept", "text/event-stream" if stream else "application/json")
        key = self._api_keys[key_index] if 0 <= key_index < len(self._api_keys) else ""
        if key:
            headers["Authorization"] = f"Bearer {key}"
        return headers

    @staticmethod
    def _backoff(attempt: int) -> float:
        return min(0.3 * (2**attempt), 2.0)

    def _send(
        self,
        method: str,
        path: str,
        *,
        key_index: int,
        json_body: dict[str, Any] | None = None,
        data: dict[str, Any] | None = None,
        files: dict[str, Any] | None = None,
        timeout: float | None = None,
        stream: bool = False,
    ) -> httpx.Response:
        """HTTP-запрос одной связкой с короткими повторами на сетевые сбои."""
        url = f"{self.base_url}{path}"
        attempts = self.max_retries + 1
        for attempt in range(attempts):
            try:
                return self._http().request(
                    method,
                    url,
                    json=json_body,
                    data=data,
                    files=files,
                    headers=self._headers(key_index, stream=stream),
                    timeout=self._make_timeout(
                        timeout if timeout is not None else self.timeout
                    ),
                )
            except httpx.HTTPError as exc:
                logger.warning(
                    "LLM %s %s: сетевая ошибка (попытка %d/%d): %s",
                    method,
                    path,
                    attempt + 1,
                    attempts,
                    exc,
                )
                if attempt >= attempts - 1:
                    raise _CandidateError(
                        FAILURE_NETWORK,
                        0,
                        f"Не удалось связаться с LLM-провайдером ({self.base_url}): {exc}",
                    ) from exc
                time.sleep(self._backoff(attempt))
        raise _CandidateError(FAILURE_NETWORK, 0, "LLM-провайдер недоступен")  # pragma: no cover

    # --------------------------------------------------------- классификация
    @staticmethod
    def _body_snippet(response: httpx.Response) -> str:
        try:
            text = response.text
        except Exception:  # pragma: no cover - экзотический сбой чтения тела
            return ""
        return " ".join(text[:500].split())

    def _classify_response(
        self, response: httpx.Response, *, endpoint: str = "chat"
    ) -> _CandidateError | None:
        """Превращает HTTP-ответ в причину сбоя связки (None — успех)."""
        status = response.status_code
        if status < 400:
            return None
        snippet = self._body_snippet(response)
        low = snippet.lower()

        if status == 429:
            reason = "квота" if any(marker in low for marker in QUOTA_MARKERS) else "лимит запросов"
            return _CandidateError(
                FAILURE_QUOTA,
                status,
                f"Лимит/квота LLM-провайдера исчерпаны ({reason}, HTTP 429). {snippet[:220]}",
            )
        if status in (401, 403):
            return _CandidateError(
                FAILURE_KEY,
                status,
                f"Ключ API отклонён провайдером (HTTP {status}). {snippet[:220]}",
            )
        if status == 404:
            if endpoint == "models":
                return _CandidateError(
                    FAILURE_ENDPOINT,
                    status,
                    "Провайдер не поддерживает GET /models",
                )
            return _CandidateError(
                FAILURE_MODEL,
                status,
                f"Модель недоступна (HTTP 404). {snippet[:220]}",
            )
        if status == 400:
            # Сначала проверяем, что 400 относится к необязательному параметру,
            # затем — к самой модели (например, «thinking level не поддерживается»).
            if any(marker in low for marker in PARAM_MARKERS):
                return _CandidateError(
                    FAILURE_PARAM,
                    status,
                    f"Провайдер отклонил параметры запроса (HTTP 400). {snippet[:220]}",
                )
            if any(marker in low for marker in MODEL_MARKERS):
                return _CandidateError(
                    FAILURE_MODEL,
                    status,
                    f"Модель/её параметры не поддерживаются (HTTP 400). {snippet[:220]}",
                )
            return _CandidateError(
                FAILURE_PARAM,
                status,
                f"Провайдер отклонил запрос (HTTP 400). {snippet[:220]}",
            )
        if status in (502, 503, 504):
            return _CandidateError(
                FAILURE_OVERLOAD,
                status,
                f"Провайдер перегружен (HTTP {status}). {snippet[:220]}",
            )
        return _CandidateError(
            FAILURE_OTHER,
            status,
            f"LLM-провайдер вернул HTTP {status}: {snippet[:300]}",
        )

    def _drop_optional_param(self, payload: dict[str, Any]) -> bool:
        """Убирает необязательный параметр, который не принял провайдер."""
        for key in ("response_format", "reasoning_effort"):
            if key in payload:
                payload.pop(key, None)
                self._unsupported_params.add(key)
                logger.info("Провайдер не принял %s — больше не отправляю", key)
                return True
        return False

    @staticmethod
    def _aggregate_error(last: _CandidateError | None, attempts: int) -> LLMError:
        """Итоговая ошибка после перебора связок."""
        last_message = last.message if last is not None else "нет доступных связок"
        return LLMError(
            f"Все доступные связки «ключ + модель» не сработали ({attempts}). "
            f"Последняя ошибка: {last_message}"
        )

    @staticmethod
    def _log_latency(label: str, seconds: float) -> None:
        logger.info("LLM %s: %.2f с", label, seconds)

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
        model: str,
        messages: list[dict[str, str]],
        *,
        json_mode: bool,
        temperature: float | None,
        max_tokens: int | None,
        stream: bool,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": model,
            "messages": [dict(item) for item in messages],
            "temperature": float(self.temperature if temperature is None else temperature),
            "stream": stream,
        }
        if json_mode and "response_format" not in self._unsupported_params:
            payload["response_format"] = {"type": "json_object"}
        if self.reasoning_effort and "reasoning_effort" not in self._unsupported_params:
            payload["reasoning_effort"] = self.reasoning_effort
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
        """Один запрос к модели с перебором связок «ключ + модель»."""
        pairs = self._available_pairs()
        started = time.monotonic()
        last: _CandidateError | None = None
        attempted = 0
        for key_index, model in pairs:
            if self._cooldown_left(key_index, model) > 0:
                continue
            attempted += 1
            payload = self._chat_payload(
                model,
                messages,
                json_mode=json_mode,
                temperature=temperature,
                max_tokens=max_tokens,
                stream=False,
            )
            overload_retried = False
            while True:
                try:
                    response = self._send(
                        "POST",
                        "/chat/completions",
                        key_index=key_index,
                        json_body=payload,
                        timeout=timeout,
                    )
                except _CandidateError as error:
                    last = error
                    break
                error = self._classify_response(response)
                if error is None:
                    try:
                        data = response.json()
                        text = self._extract_message_text(data)
                    except (ValueError, LLMError) as exc:
                        last = _CandidateError(
                            FAILURE_OTHER,
                            response.status_code,
                            f"Не удалось разобрать ответ модели: {exc}",
                        )
                        break
                    self._register_success(key_index, model)
                    self._log_latency("запрос", time.monotonic() - started)
                    return text
                last = error
                if error.kind == FAILURE_PARAM:
                    if self._drop_optional_param(payload):
                        continue
                    raise LLMError(error.message) from None
                if error.kind == FAILURE_OVERLOAD and not overload_retried:
                    # Временная перегрузка: одна повторная попытка той же связкой.
                    overload_retried = True
                    time.sleep(0.3)
                    continue
                break
            if last is not None:
                self._register_failure(key_index, model, last)
        raise self._aggregate_error(last, attempted)

    def chat_stream(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float | None = None,
        timeout: float | None = None,
    ) -> Iterator[str]:
        """Потоковые дельты ответа; ошибка до первого токена → следующий кандидат."""
        pairs = self._available_pairs()
        started = time.monotonic()
        last: _CandidateError | None = None
        attempted = 0
        for key_index, model in pairs:
            if self._cooldown_left(key_index, model) > 0:
                continue
            attempted += 1
            payload = self._chat_payload(
                model,
                messages,
                json_mode=False,
                temperature=temperature,
                max_tokens=None,
                stream=True,
            )
            overload_retried = False
            while True:
                received = False
                try:
                    with self._http().stream(
                        "POST",
                        f"{self.base_url}/chat/completions",
                        json=payload,
                        headers=self._headers(key_index, stream=True),
                        timeout=self._make_timeout(
                            timeout if timeout is not None else self.timeout
                        ),
                    ) as response:
                        if response.status_code >= 400:
                            response.read()
                            error = self._classify_response(response)
                            raise error or _CandidateError(
                                FAILURE_OTHER,
                                response.status_code,
                                f"LLM-провайдер вернул HTTP {response.status_code}",
                            )
                        for piece in _iter_sse_deltas(response):
                            received = True
                            yield piece
                    if not received:
                        raise _CandidateError(
                            FAILURE_OTHER, 0, "Модель не вернула потоковый ответ"
                        )
                    self._register_success(key_index, model)
                    self._log_latency("поток", time.monotonic() - started)
                    return
                except _CandidateError as error:
                    if received:
                        raise LLMError(
                            f"Поток LLM прервался после первого токена: {error.message}"
                        ) from error
                    last = error
                    if error.kind == FAILURE_PARAM:
                        if self._drop_optional_param(payload):
                            continue
                        raise LLMError(error.message) from None
                    if error.kind == FAILURE_OVERLOAD and not overload_retried:
                        overload_retried = True
                        time.sleep(0.3)
                        continue
                    break
                except httpx.HTTPError as exc:
                    if received:
                        raise LLMError(f"Поток LLM прервался: {exc}") from exc
                    last = _CandidateError(
                        FAILURE_NETWORK, 0, f"Сетевой сбой потока: {exc}"
                    )
                    break
            if last is not None:
                self._register_failure(key_index, model, last)
        raise self._aggregate_error(last, attempted)

    # --------------------------------------------------------------- health
    @staticmethod
    def _parse_models(response: httpx.Response) -> list[str]:
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

    def list_models(self, *, timeout: float | None = None) -> list[str]:
        """Список моделей провайдера (health-check) с перебором связок."""
        pairs = self._available_pairs()
        last: _CandidateError | None = None
        attempted = 0
        for key_index, model in pairs:
            if self._cooldown_left(key_index, model) > 0:
                continue
            attempted += 1
            try:
                response = self._send(
                    "GET",
                    "/models",
                    key_index=key_index,
                    timeout=timeout if timeout is not None else min(self.timeout, 10.0),
                )
            except _CandidateError as error:
                last = error
                continue
            error = self._classify_response(response, endpoint="models")
            if error is None:
                try:
                    models = self._parse_models(response)
                except LLMError as exc:
                    last = _CandidateError(FAILURE_OTHER, response.status_code, str(exc))
                    continue
                self._register_success(key_index, model)
                return models
            if error.kind == FAILURE_ENDPOINT:
                raise LLMError(error.message) from None
            last = error
            self._register_failure(key_index, model, error)
        raise self._aggregate_error(last, attempted)

    def ping(self, *, use_cache: bool = True) -> tuple[bool, str]:
        """Фактическая проверка доступности провайдера.

        Сначала пробуем ``GET /models``. Если провайдер его не поддерживает
        (так ведёт себя OpenAI-совместимый шлюз Gemini), проверяем минимальным
        chat-запросом. Замер задержки сохраняется в ``last_ping_ms``,
        результат кэшируется на 5 минут. В сообщении — активная связка.
        """
        if not self.configured:
            return False, "Ключ API не задан — доступен только офлайн-режим"
        now = time.monotonic()
        if use_cache and self._ping_cache is not None:
            cached_at, cached_result, cached_ms = self._ping_cache
            if now - cached_at < self._ping_ttl_sec:
                self.last_ping_ms = cached_ms
                return cached_result
        ok, message, elapsed_ms = self._ping_uncached()
        self.last_ping_ms = elapsed_ms
        self._ping_cache = (now, (ok, message), elapsed_ms)
        return ok, message

    def _bundle_label(self) -> str:
        """Человекочитаемая активная связка «модель + ключ»."""
        return f"{self.model}, ключ {self.key_number}"

    def _ping_uncached(self) -> tuple[bool, str, float]:
        started = time.monotonic()
        try:
            models = self.list_models(timeout=min(max(self.timeout, 3.0), 10.0))
        except LLMError as exc:
            # Некоторые OpenAI-совместимые шлюзы не отдают /models —
            # проверяем коротким chat-запросом.
            logger.info("Провайдер не отдал /models (%s), проверяю chat-запросом", exc)
            try:
                self.chat(
                    [{"role": "user", "content": "ping"}],
                    temperature=0.0,
                    timeout=min(max(self.timeout, 5.0), 20.0),
                )
            except LLMError as chat_exc:
                seconds = time.monotonic() - started
                return False, f"Модель недоступна: {chat_exc}", seconds * 1000.0
            seconds = time.monotonic() - started
            return (
                True,
                f"Модель отвечает за {seconds:.1f} с (активная связка: {self._bundle_label()})",
                seconds * 1000.0,
            )
        seconds = time.monotonic() - started
        if models and self.model and not any(
            self.model == item or self.model in item for item in models
        ):
            return (
                True,
                f"Провайдер отвечает за {seconds:.1f} с (активная связка: {self._bundle_label()}), "
                f"модели «{self.model}» нет в /models",
                seconds * 1000.0,
            )
        return (
            True,
            f"Модель отвечает за {seconds:.1f} с (активная связка: {self._bundle_label()})",
            seconds * 1000.0,
        )

    # --------------------------------------------------------- транскрипция
    def transcribe(self, *, audio: bytes, filename: str, language: str | None = "ru") -> str:
        """Распознавание речи с перебором ключей (``/audio/transcriptions``)."""
        if not self.configured:
            raise LLMError("Провайдер распознавания речи не настроен")
        if not audio:
            raise LLMError("Пустой аудиофайл")
        safe_name = (filename or "audio.webm").strip() or "audio.webm"
        files = {"file": (safe_name, audio, "application/octet-stream")}
        form: dict[str, Any] = {"model": self.transcription_model}
        if language:
            form["language"] = language

        key_order = list(range(len(self._api_keys)))
        if self.active_key_index in key_order:
            key_order.remove(self.active_key_index)
            key_order.insert(0, self.active_key_index)

        last: _CandidateError | None = None
        attempted = 0
        for key_index in key_order:
            if self._cooldown_left(key_index, self.transcription_model) > 0:
                continue
            attempted += 1
            try:
                response = self._send(
                    "POST",
                    "/audio/transcriptions",
                    key_index=key_index,
                    data=form,
                    files=files,
                    timeout=min(self.timeout, 60.0),
                )
            except _CandidateError as error:
                last = error
                continue
            error = self._classify_response(response)
            if error is None:
                try:
                    data = response.json()
                except ValueError:
                    data = {}
                text = (
                    str((data or {}).get("text") or "").strip()
                    if isinstance(data, dict)
                    else ""
                )
                if not text:
                    last = _CandidateError(FAILURE_OTHER, response.status_code, "Провайдер не распознал речь")
                    continue
                self._cooldowns.pop((key_index, self.transcription_model), None)
                logger.info("LLM: распознавание речи — ключ #%d", key_index + 1)
                return text
            last = error
            if error.kind == FAILURE_PARAM:
                raise LLMError(error.message) from None
            self._register_failure(key_index, self.transcription_model, error)
            if error.kind == FAILURE_KEY:
                # Ключ плох для всех моделей, включая модель транскрипции.
                self._cooldowns[(key_index, self.transcription_model)] = (
                    self._now() + self.key_cooldown_sec
                )
        raise self._aggregate_error(last, attempted)


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

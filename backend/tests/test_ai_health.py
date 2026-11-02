"""Тесты состояния ИИ-слоя и голосового ввода (docs/API.md §7)."""
from app.main import app


def test_ai_health_offline_mode(client):
    response = client.get("/api/ai/health")
    assert response.status_code == 200, response.text
    payload = response.json()
    assert set(payload) >= {"provider", "model", "mode", "available", "message"}
    assert payload["mode"] in {"live", "offline"}
    assert payload["mode"] == "offline"  # тесты принудительно идут без ключа API
    assert payload["available"] is True
    assert payload["provider"].strip()
    assert isinstance(payload["message"], str)


def test_service_health_reports_ai_mode(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["ai_mode"] in {"live", "offline"}
    assert payload["ai_provider"].strip()


def test_voice_transcribe_unavailable_offline(client):
    response = client.post(
        "/api/voice/transcribe",
        files={"file": ("sample.webm", b"fake-audio-bytes", "audio/webm")},
    )
    # без серверного провайдера распознавания фронтенд использует Web Speech API
    assert response.status_code == 503
    assert response.json().get("detail")


def test_voice_transcribe_rejects_empty_file(client):
    response = client.post(
        "/api/voice/transcribe",
        files={"file": ("empty.webm", b"", "audio/webm")},
    )
    assert response.status_code == 400


def test_voice_transcribe_rejects_unsupported_format(client):
    response = client.post(
        "/api/voice/transcribe",
        files={"file": ("notes.txt", b"not audio", "text/plain")},
    )
    assert response.status_code == 400


def test_ai_routes_are_registered():
    # FastAPI 0.162 хранит включённые роутеры лениво, поэтому проверяем OpenAPI-схему
    paths = set(app.openapi().get("paths", {}))
    assert "/api/ai/health" in paths
    assert "/api/voice/transcribe" in paths
    assert "/api/chat/conversations" in paths
    assert "/api/code/tasks" in paths

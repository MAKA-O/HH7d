"""Общие фикстуры pytest: изолированная SQLite и TestClient.

КРИТИЧНО: переменная окружения ``DATABASE_URL`` выставляется **до** импорта
``app``, поэтому приложение подключается к временному файлу в ``<repo>/.tmp``,
а реальная база ``backend/data/app.db`` не затрагивается.

Дополнительно принудительно включён офлайн-режим ИИ (``AI_PROVIDER=offline``),
чтобы тесты не ходили в сеть и не зависели от ключей API.
"""
import atexit
import os
import shutil
import sys
import tempfile
from pathlib import Path

# --- изоляция окружения: выполняется до первого импорта приложения ------------
BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_DIR.parent

_TMP_DIR = REPO_ROOT / ".tmp" / "pytest"
_TMP_DIR.mkdir(parents=True, exist_ok=True)
# Уникальный каталог на процесс: параллельный прогон тестов (например, у другого
# разработчика) не конфликтует за один и тот же файл SQLite.
_RUN_DIR = Path(tempfile.mkdtemp(prefix=f"run-{os.getpid()}-", dir=str(_TMP_DIR)))
TEST_DB_PATH = _RUN_DIR / "test_app.db"
atexit.register(shutil.rmtree, _RUN_DIR, True)

os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_PATH.as_posix()}"
os.environ["AI_PROVIDER"] = "offline"
os.environ["AI_API_KEY"] = ""
os.environ["SECRET_KEY"] = "test-secret-key-for-pytest-only-0123456789abcdef"

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402

TEST_PASSWORD = "secret123"
TEST_EMAIL = "student@example.com"
SECOND_EMAIL = "second@example.com"
THIRD_EMAIL = "third@example.com"


# ------------------------------------------------------------------ фикстуры БД
@pytest.fixture(autouse=True)
def _clean_database():
    """Перед каждым тестом создаёт пустую схему — тесты не влияют друг на друга."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture()
def client(_clean_database) -> TestClient:
    """TestClient с запущенным lifespan приложения."""
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client


@pytest.fixture()
def db_session(_clean_database):
    """Прямой доступ к сессии SQLAlchemy для проверок состояния БД."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


# ------------------------------------------------------------------ авторизация
def register_user(
    client: TestClient,
    email: str = TEST_EMAIL,
    password: str = TEST_PASSWORD,
    full_name: str = "Иван Петров",
) -> dict:
    """Регистрирует пользователя и возвращает тело ответа (token + user)."""
    response = client.post(
        "/api/auth/register",
        json={"email": email, "password": password, "full_name": full_name},
    )
    assert response.status_code == 201, response.text
    return response.json()


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def make_user(client):
    """Фабрика пользователей: возвращает dict с user, token и headers."""

    def _make(email: str = TEST_EMAIL, password: str = TEST_PASSWORD, full_name: str = "Иван Петров") -> dict:
        payload = register_user(client, email=email, password=password, full_name=full_name)
        return {
            "user": payload["user"],
            "token": payload["access_token"],
            "headers": auth_headers(payload["access_token"]),
            "email": email,
            "password": password,
        }

    return _make


@pytest.fixture()
def user(make_user) -> dict:
    """Основной авторизованный пользователь теста."""
    return make_user(TEST_EMAIL)


@pytest.fixture()
def user_headers(user) -> dict[str, str]:
    return user["headers"]


@pytest.fixture()
def second_user(make_user) -> dict:
    """Второй пользователь — для проверки изоляции данных."""
    return make_user(SECOND_EMAIL, full_name="Мария Сидорова")


@pytest.fixture()
def second_headers(second_user) -> dict[str, str]:
    return second_user["headers"]


# ------------------------------------------------------------------ собеседования
def create_interview(
    client: TestClient,
    headers: dict[str, str],
    *,
    role: str = "backend",
    level: str = "junior",
    mode: str = "mixed",
    question_count: int = 5,
    focus_topics: list[str] | None = None,
) -> dict:
    """Создаёт собеседование и возвращает SessionDetail."""
    response = client.post(
        "/api/interviews",
        headers=headers,
        json={
            "role": role,
            "level": level,
            "mode": mode,
            "question_count": question_count,
            "focus_topics": focus_topics or [],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def submit_answer(
    client: TestClient,
    headers: dict[str, str],
    session_id: int,
    question_id: int,
    text: str = (
        "Это структура данных для ускорения поиска. Индекс ускоряет WHERE и JOIN, "
        "но замедляет вставку и обновление, поэтому индексируют селективные поля."
    ),
    time_spent_sec: int = 60,
) -> dict:
    """Отправляет ответ на вопрос и возвращает AnswerResult."""
    response = client.post(
        f"/api/interviews/{session_id}/answers",
        headers=headers,
        json={"question_id": question_id, "text": text, "time_spent_sec": time_spent_sec},
    )
    assert response.status_code == 200, response.text
    return response.json()

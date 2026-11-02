"""Тесты инфраструктуры тестов: изоляция БД и принудительный офлайн-режим ИИ."""
from pathlib import Path

from sqlalchemy.engine import make_url

from app.config import settings
from app.db import engine
from tests.conftest import REPO_ROOT, TEST_DB_PATH, register_user

REAL_DB_PATH = REPO_ROOT / "backend" / "data" / "app.db"


def test_tests_use_temporary_database():
    url = make_url(settings.database_url)
    database = Path(url.database or "").resolve()
    assert database == TEST_DB_PATH.resolve()
    assert database != REAL_DB_PATH.resolve()
    assert REPO_ROOT / ".tmp" in database.parents or ".tmp" in database.parts


def test_engine_points_to_temporary_database():
    database = Path(str(engine.url.database)).resolve()
    assert database == TEST_DB_PATH.resolve()
    assert database.name == "test_app.db"


def test_real_database_file_is_not_modified_by_tests(client):
    """Реальная база не должна меняться во время тестового прогона."""
    before = None
    if REAL_DB_PATH.exists():
        stat = REAL_DB_PATH.stat()
        before = (stat.st_size, stat.st_mtime_ns)

    register_user(client, email="isolation-check@example.com")
    client.get("/api/interviews")

    if before is not None:
        stat = REAL_DB_PATH.stat()
        assert (stat.st_size, stat.st_mtime_ns) == before


def test_ai_forced_to_offline_mode():
    assert settings.ai_provider == "offline"
    assert settings.ai_enabled is False

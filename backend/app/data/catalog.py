"""Справочники: направления, уровни, режимы собеседований.

Используется роутерами (/api/meta), ИИ-промптами и офлайн-банком вопросов.
Не менять коды ролей/уровней без обновления docs/API.md.
"""
from typing import Any

ROLES: list[dict[str, Any]] = [
    {
        "code": "backend",
        "title": "Backend-разработчик",
        "description": "Python/Java/Go, API, базы данных, архитектура сервисов.",
        "topics": [
            "Python",
            "ООП",
            "Базы данных и SQL",
            "REST API",
            "Алгоритмы и структуры данных",
            "Сети и HTTP",
            "Тестирование",
            "Docker и CI/CD",
            "Архитектура и проектирование",
        ],
    },
    {
        "code": "frontend",
        "title": "Frontend-разработчик",
        "description": "JavaScript/TypeScript, React, браузер, вёрстка, производительность.",
        "topics": [
            "JavaScript",
            "TypeScript",
            "React",
            "HTML и CSS",
            "Браузер и DOM",
            "Сети и HTTP",
            "Сборка и инструменты",
            "Производительность",
        ],
    },
    {
        "code": "qa",
        "title": "QA-инженер",
        "description": "Теория тестирования, тест-дизайн, API- и автотесты, процессы.",
        "topics": [
            "Теория тестирования",
            "Тест-дизайн",
            "API-тестирование",
            "Автотесты",
            "SQL для тестировщика",
            "Баг-репорты и процессы",
        ],
    },
    {
        "code": "data",
        "title": "Аналитик / Data Scientist",
        "description": "Python для данных, SQL, статистика, основы ML.",
        "topics": [
            "Python для данных",
            "SQL и аналитика",
            "Статистика",
            "Основы машинного обучения",
            "Pandas и NumPy",
            "Визуализация данных",
        ],
    },
    {
        "code": "devops",
        "title": "DevOps-инженер",
        "description": "Linux, контейнеры, CI/CD, Kubernetes, мониторинг.",
        "topics": [
            "Linux",
            "Docker",
            "CI/CD",
            "Kubernetes",
            "Сети",
            "Мониторинг и логирование",
        ],
    },
    {
        "code": "general",
        "title": "Общее / HR-собеседование",
        "description": "Вопросы о себе, мотивации, командной работе и карьере.",
        "topics": [
            "О себе",
            "Мотивация",
            "Командная работа",
            "Конфликты и обратная связь",
            "Карьерные цели",
        ],
    },
]

LEVELS: list[dict[str, str]] = [
    {"code": "intern", "title": "Intern / стажёр"},
    {"code": "junior", "title": "Junior"},
    {"code": "middle", "title": "Middle"},
    {"code": "senior", "title": "Senior"},
]

MODES: list[dict[str, str]] = [
    {"code": "mixed", "title": "Смешанное собеседование"},
    {"code": "theory", "title": "Только теория"},
    {"code": "code", "title": "Теория + задача с кодом"},
]

QUESTION_TYPES: list[dict[str, str]] = [
    {"code": "theory", "title": "Теоретический вопрос"},
    {"code": "code", "title": "Задача с кодом"},
]

DIFFICULTIES: list[dict[str, str]] = [
    {"code": "easy", "title": "Лёгкий"},
    {"code": "medium", "title": "Средний"},
    {"code": "hard", "title": "Сложный"},
]

LEVEL_ORDER = {item["code"]: index for index, item in enumerate(LEVELS)}
LEVEL_TITLES = {item["code"]: item["title"] for item in LEVELS}
ROLE_TITLES = {item["code"]: item["title"] for item in ROLES}
ROLE_CODES = [item["code"] for item in ROLES]

# Базовая сложность под уровень
LEVEL_DIFFICULTY = {
    "intern": "easy",
    "junior": "easy",
    "middle": "medium",
    "senior": "hard",
}


def role_by_code(code: str) -> dict[str, Any] | None:
    return next((role for role in ROLES if role["code"] == code), None)


def role_topics(code: str) -> list[str]:
    role = role_by_code(code)
    return list(role["topics"]) if role else []


def normalize_level(code: str | None) -> str:
    return code if code in LEVEL_ORDER else "junior"


def normalize_role(code: str | None) -> str:
    return code if code in ROLE_TITLES else "backend"


def meta_payload() -> dict[str, Any]:
    return {
        "roles": ROLES,
        "levels": LEVELS,
        "modes": MODES,
        "question_types": QUESTION_TYPES,
        "difficulties": DIFFICULTIES,
    }

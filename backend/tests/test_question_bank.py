"""Тесты встроенного банка вопросов: объём, покрытие, контракт публичного API."""
from collections import Counter

import pytest

from app.data.catalog import ROLES
from app.data.question_bank import (
    BANK,
    CODE_TASKS,
    DIFFICULTY_ORDER,
    LEVEL_TARGET,
    all_questions,
    bank_size,
    pick_code_task,
    pick_questions,
)

ROLE_TOPICS: dict[str, set[str]] = {role["code"]: set(role["topics"]) for role in ROLES}
ALL_TOPICS: set[str] = {topic for topics in ROLE_TOPICS.values() for topic in topics}
MIN_BY_ROLE = {
    "backend": 35,
    "frontend": 30,
    "qa": 25,
    "data": 25,
    "devops": 20,
    "general": 20,
}
ROLE_ORDER = ["backend", "frontend", "qa", "data", "devops", "general"]


def test_bank_size_is_enough():
    assert bank_size() == len(BANK)
    assert bank_size() >= 150, f"в банке только {bank_size()} вопросов"


@pytest.mark.parametrize("role", ROLE_ORDER)
def test_role_coverage(role: str):
    count = sum(1 for item in BANK if item["role"] == role)
    assert count >= MIN_BY_ROLE[role], f"{role}: {count} < {MIN_BY_ROLE[role]}"


@pytest.mark.parametrize("role", ROLE_ORDER)
def test_every_role_has_all_difficulties(role: str):
    difficulties = Counter(item["difficulty"] for item in BANK if item["role"] == role)
    assert set(difficulties) == set(DIFFICULTY_ORDER), f"{role}: {dict(difficulties)}"


def test_topics_come_from_catalog():
    for item in BANK:
        assert item["topic"] in ROLE_TOPICS[item["role"]], (
            f"тема «{item['topic']}» отсутствует в catalog.py для роли {item['role']}"
        )


def test_questions_have_required_fields():
    for item in BANK:
        assert item["type"] in {"theory", "code"}
        assert item["text"].strip(), "пустой текст вопроса"
        assert item["role"] in ROLE_TOPICS
        if item["type"] == "code":
            assert item.get("starter_code"), f"у задачи нет starter_code: {item['text'][:50]}"
            assert item.get("language"), f"у задачи нет language: {item['text'][:50]}"


def test_expected_points_are_concrete():
    for item in BANK:
        points = item.get("expected_points")
        assert isinstance(points, list)
        assert 3 <= len(points) <= 5, f"{item['text'][:60]}: {len(points)} пунктов"
        for point in points:
            assert isinstance(point, str) and len(point.strip()) >= 10, (
                f"слишком короткий пункт в «{item['text'][:60]}»: {point!r}"
            )


def test_question_texts_are_unique():
    texts = [item["text"].strip().lower() for item in BANK]
    duplicates = [text for text, count in Counter(texts).items() if count > 1]
    assert not duplicates, f"дубликаты вопросов: {duplicates}"


def test_code_tasks_are_ready():
    assert len(CODE_TASKS) >= 15, f"задач с кодом только {len(CODE_TASKS)}"
    titles = [task["title"] for task in CODE_TASKS]
    assert len(titles) == len(set(titles)), "заголовки задач не уникальны"
    required = {
        "title",
        "topic",
        "language",
        "difficulty",
        "description",
        "starter_code",
        "hints",
        "expected_points",
    }
    for task in CODE_TASKS:
        assert required <= set(task), f"не хватает полей: {required - set(task)}"
        assert task["topic"] in ALL_TOPICS, f"тема задачи не из справочника: {task['topic']}"
        assert task["difficulty"] in DIFFICULTY_ORDER
        assert task["title"].strip() and task["description"].strip()
        assert task["starter_code"].strip()
        assert len(task["hints"]) >= 2
        assert 3 <= len(task["expected_points"]) <= 5
    difficulties = {task["difficulty"] for task in CODE_TASKS}
    assert difficulties == set(DIFFICULTY_ORDER)


@pytest.mark.parametrize("role", ROLE_ORDER)
@pytest.mark.parametrize("level", list(LEVEL_TARGET))
@pytest.mark.parametrize("mode", ["mixed", "theory", "code"])
def test_pick_questions_returns_requested_count(role: str, level: str, mode: str):
    picked = pick_questions(role=role, level=level, mode=mode, count=7)
    assert len(picked) == 7
    assert all(item["role"] in (role, "general") for item in picked)
    if mode == "theory":
        assert all(item["type"] == "theory" for item in picked)
    if mode == "code" and role != "general":
        assert any(item["type"] == "code" for item in picked)


def test_pick_questions_respects_focus_and_exclude():
    focused = pick_questions(
        role="backend", level="middle", mode="theory", count=5, focus_topics=["Python"]
    )
    assert focused[0]["topic"] == "Python"
    assert sum(1 for item in focused if item["topic"] == "Python") >= 2

    excluded = [item["text"] for item in BANK if item["role"] == "backend"][:5]
    picked = pick_questions(
        role="backend", level="middle", mode="theory", count=10, exclude=excluded
    )
    assert not {item["text"] for item in picked} & set(excluded)
    assert len(picked) == 10


def test_pick_questions_zero_and_small_counts():
    assert pick_questions(role="backend", level="junior", mode="mixed", count=0) == []
    assert len(pick_questions(role="backend", level="junior", mode="mixed", count=1)) == 1


@pytest.mark.parametrize("language", ["python", "sql", "javascript"])
@pytest.mark.parametrize("difficulty", ["easy", "medium", "hard"])
def test_pick_code_task(language: str, difficulty: str):
    task = pick_code_task(topic=None, language=language, difficulty=difficulty)
    assert task["starter_code"].strip()
    assert task["description"].strip()
    assert task["difficulty"] in DIFFICULTY_ORDER


def test_pick_code_task_prefers_topic_and_language():
    task = pick_code_task(
        topic="Базы данных и SQL", language="sql", difficulty="medium"
    )
    assert task["language"] == "sql"
    assert task["topic"] == "Базы данных и SQL"


def test_all_questions_returns_independent_copies():
    questions = all_questions()
    assert len(questions) == bank_size()
    questions[0]["text"] = "изменённый текст"
    assert BANK[0]["text"] != "изменённый текст"

"""Юнит-тесты офлайн-движка ИИ (``app.ai.offline``).

Проверяем контракт ``AIService`` без сети и без БД: валидность pydantic-схем,
диапазоны баллов, непустые обязательные поля, детерминизм и определение темы
чат-ассистентом.
"""
from __future__ import annotations

from app.ai.base import (
    CodeReviewData,
    CodeTaskData,
    EvaluationResult,
    GeneratedQuestion,
    SessionReportData,
)
from app.ai.offline import OfflineEngine
from app.ai.providers import LLMClient, extract_json_object


def make_question(
    *,
    text: str = "Что такое индекс в базе данных?",
    topic: str = "Базы данных и SQL",
    seen: bool = True,
) -> dict:
    """Вопрос в формате, который передаёт роутер собеседований."""
    return {
        "id": 1,
        "text": text,
        "topic": topic,
        "difficulty": "medium",
        "type": "theory",
        "expected_points": [
            "индекс — дополнительная структура данных (обычно B-tree) для ускорения поиска",
            "ускоряет WHERE/JOIN/ORDER BY по индексированным полям",
            "замедляет вставку/обновление/удаление и занимает место",
            "селективность: индексировать стоит колонки с высокой кардинальностью",
        ],
        "starter_code": None,
        "language": None,
        "seen": seen,
    }


STRONG_ANSWER = (
    "Индекс — это дополнительная структура данных, чаще всего B-tree, которая ускоряет поиск строк. "
    "Он помогает в WHERE, JOIN и ORDER BY по индексированным полям. "
    "Но индекс замедляет вставку, обновление и удаление, потому что его нужно поддерживать, "
    "и занимает место на диске. "
    "Поэтому индексировать стоит селективные колонки с высокой кардинальностью, а не все подряд. "
    "Например, поиск по email — хороший кандидат для индекса, а поле «пол» — плохой. "
    "Итог: индекс ускоряет чтение и замедляет запись, это компромисс."
)

WEAK_ANSWER = "Индекс нужен для быстрого поиска."


def test_offline_health() -> None:
    """Офлайн-движок всегда доступен и отдаёт mode=\"offline\"."""
    info = OfflineEngine().health()
    assert info.mode == "offline"
    assert info.available is True
    assert info.provider
    assert info.model


def test_generate_questions_returns_exact_count() -> None:
    """Генерация вопросов: ровно count валидных вопросов без повторов."""
    engine = OfflineEngine()
    questions = engine.generate_questions(
        role="backend", level="junior", mode="mixed", count=5
    )
    assert len(questions) == 5
    assert all(isinstance(question, GeneratedQuestion) for question in questions)
    assert all(question.text.strip() for question in questions)
    assert all(question.topic for question in questions)
    assert all(question.difficulty in ("easy", "medium", "hard") for question in questions)
    assert all(question.type in ("theory", "code") for question in questions)
    assert len({question.text for question in questions}) == 5


def test_generate_questions_code_mode_has_code_task() -> None:
    """В режиме code среди вопросов есть задача с кодом и заготовкой."""
    engine = OfflineEngine()
    questions = engine.generate_questions(
        role="backend", level="middle", mode="code", count=4
    )
    assert len(questions) == 4
    assert any(question.type == "code" for question in questions)
    code_questions = [question for question in questions if question.type == "code"]
    assert all(question.starter_code for question in code_questions)


def test_next_question_respects_exclude() -> None:
    """Адаптивный вопрос не повторяет уже заданные."""
    engine = OfflineEngine()
    exclude = [
        "Что такое GIL в Python и как он влияет на многопоточность?",
        "Чем список (list) отличается от кортежа (tuple) в Python?",
    ]
    question = engine.next_question(
        role="backend", level="junior", mode="theory", exclude=exclude
    )
    assert isinstance(question, GeneratedQuestion)
    assert question.text
    assert question.text not in exclude


def test_evaluate_strong_answer_gets_high_score() -> None:
    """Полный структурированный ответ получает высокий согласованный балл."""
    engine = OfflineEngine()
    result = engine.evaluate_answer(
        question=make_question(), answer_text=STRONG_ANSWER, role="backend", level="junior"
    )
    assert isinstance(result, EvaluationResult)
    assert 6.5 <= result.score <= 10.0
    assert set(result.criteria) == {"correctness", "completeness", "depth", "clarity"}
    assert all(0.0 <= value <= 10.0 for value in result.criteria.values())
    expected_mean = round(sum(result.criteria.values()) / 4, 1)
    assert abs(result.score - expected_mean) <= 0.1
    assert result.strengths and all(isinstance(item, str) for item in result.strengths)
    assert result.gaps
    assert result.ideal_answer
    assert result.recommendation
    assert result.follow_up_question


def test_evaluate_weak_answer_gets_low_score() -> None:
    """Короткий поверхностный ответ получает низкий балл и список пробелов."""
    engine = OfflineEngine()
    result = engine.evaluate_answer(
        question=make_question(), answer_text=WEAK_ANSWER, role="backend", level="junior"
    )
    assert 0.0 <= result.score <= 4.5
    assert all(0.0 <= value <= 10.0 for value in result.criteria.values())
    assert result.gaps
    assert any("коротк" in gap.lower() or "не раскрыто" in gap.lower() for gap in result.gaps)
    assert result.follow_up_question


def test_evaluate_strong_better_than_weak() -> None:
    """Оценка детерминирована и осмысленно упорядочена."""
    engine = OfflineEngine()
    strong = engine.evaluate_answer(
        question=make_question(), answer_text=STRONG_ANSWER, role="backend", level="junior"
    )
    weak = engine.evaluate_answer(
        question=make_question(), answer_text=WEAK_ANSWER, role="backend", level="junior"
    )
    assert strong.score > weak.score
    assert strong.criteria["completeness"] > weak.criteria["completeness"]
    assert strong.criteria["depth"] > weak.criteria["depth"]


def test_evaluate_without_expected_points_is_safe() -> None:
    """Вопрос без expected_points не ломает оценку и эталон."""
    engine = OfflineEngine()
    question = make_question(seen=False)
    question["expected_points"] = []
    result = engine.evaluate_answer(
        question=question,
        answer_text="Индекс — это структура данных для ускорения поиска.",
        role="backend",
        level="middle",
    )
    assert 0.0 <= result.score <= 10.0
    assert result.ideal_answer
    assert result.recommendation


def test_build_report_aggregates_topics() -> None:
    """Отчёт агрегирует темы и согласован с оценками ответов."""
    engine = OfflineEngine()
    items = [
        {
            "question": make_question(),
            "evaluation": {
                "score": 8.0,
                "criteria": {"correctness": 8.0, "completeness": 8.0, "depth": 8.0, "clarity": 8.0},
                "strengths": ["Верно раскрыт пункт про B-tree"],
                "gaps": ["Не упомянута селективность"],
            },
        },
        {
            "question": make_question(text="Что такое GIL?", topic="Python"),
            "evaluation": {
                "score": 4.0,
                "criteria": {"correctness": 4.0, "completeness": 4.0, "depth": 4.0, "clarity": 4.0},
                "strengths": ["Определение GIL дано"],
                "gaps": ["Не сказано про multiprocessing"],
            },
        },
    ]
    report = engine.build_report(items=items, role="backend", level="junior", duration_sec=600)
    assert isinstance(report, SessionReportData)
    assert 0.0 <= report.overall_score <= 10.0
    assert report.overall_score == 6.0
    assert report.verdict
    assert set(report.topic_scores) == {"Базы данных и SQL", "Python"}
    assert report.topic_scores["Базы данных и SQL"] == 8.0
    assert report.topic_scores["Python"] == 4.0
    assert report.strengths and report.gaps and report.recommendations


def test_build_report_empty_items() -> None:
    """Пустой список ответов не ломает отчёт."""
    report = OfflineEngine().build_report(
        items=[], role="backend", level="junior", duration_sec=0
    )
    assert report.overall_score == 0.0
    assert report.verdict
    assert report.recommendations


def test_generate_code_task_python() -> None:
    """Задача с кодом валидна для python."""
    task = OfflineEngine().generate_code_task(
        topic="Алгоритмы и структуры данных",
        language="python",
        difficulty="easy",
        role="backend",
        level="junior",
    )
    assert isinstance(task, CodeTaskData)
    assert task.title
    assert task.description
    assert task.language == "python"
    assert task.starter_code
    assert task.difficulty == "easy"


def test_generate_code_task_other_language() -> None:
    """Шаблон задачи подстраивается под запрошенный язык."""
    task = OfflineEngine().generate_code_task(
        topic=None, language="javascript", difficulty="hard", role="frontend", level="middle"
    )
    assert task.language == "javascript"
    assert task.starter_code
    assert task.hints


def test_review_unimplemented_code() -> None:
    """Заготовка с pass/... получает критические замечания и низкий балл."""
    engine = OfflineEngine()
    code = (
        "def second_largest(nums: list[int]) -> int | None:\n"
        "    # ваш код\n"
        "    ...\n"
    )
    review = engine.review_code(task=None, code=code, language="python")
    assert isinstance(review, CodeReviewData)
    assert review.score <= 5.0
    assert review.issues
    assert any(issue.severity == "critical" for issue in review.issues)
    assert review.improved_code
    assert review.time_complexity and review.space_complexity
    assert review.verdict


def test_review_good_code() -> None:
    """Аккуратное решение с проверкой краевых случаев оценивается выше заготовки."""
    engine = OfflineEngine()
    good_code = (
        "def second_largest(nums: list[int]) -> int | None:\n"
        '    """Возвращает второй по величине уникальный элемент или None."""\n'
        "    if not nums:\n"
        "        return None\n"
        "    unique = sorted(set(nums))\n"
        "    return unique[-2] if len(unique) > 1 else None\n"
    )
    good = engine.review_code(task=None, code=good_code, language="python")
    bad = engine.review_code(
        task=None, code="def second_largest(nums):\n    pass\n", language="python"
    )
    assert good.score > bad.score
    assert 0.0 <= good.score <= 10.0
    assert good.improved_code
    assert all(issue.severity in ("critical", "major", "minor", "nit") for issue in good.issues)


def test_review_detects_problems() -> None:
    """Эвристики ловят TODO, вложенные циклы, print и отсутствие проверок."""
    engine = OfflineEngine()
    code = (
        "def solve(nums):\n"
        "    # TODO: доделать\n"
        "    for i in nums:\n"
        "        for j in nums:\n"
        "            print(i, j)\n"
    )
    review = engine.review_code(task=None, code=code, language="python")
    titles = " ".join(issue.title.lower() for issue in review.issues)
    assert "todo" in titles or "незаверш" in titles
    assert "вложен" in titles
    assert review.score < 6.0


def test_review_empty_code() -> None:
    """Пустой код даёт нулевую оценку, но валидную схему."""
    review = OfflineEngine().review_code(task=None, code="   ", language="python")
    assert review.score == 0.0
    assert review.issues
    assert review.improved_code


def test_chat_topics_are_correct() -> None:
    """Ассистент отвечает строго по спрошенной теме (специфичные ключи важнее общих)."""
    engine = OfflineEngine()
    cases = [
        ("Что такое GIL в Python?", ["GIL", "поток"]),
        ("Зачем нужны индексы в БД?", ["индекс", "B-tree"]),
        ("Что такое транзакция и уровни изоляции?", ["транзакц", "изоляц"]),
        ("Какие бывают HTTP-методы?", ["GET", "POST", "статус"]),
        ("Как работает REST API?", ["REST", "идемпотент"]),
        ("Что такое состояние в React?", ["state", "пропс"]),
        ("Как работают хуки в React?", ["useState", "useEffect"]),
        ("Что такое пирамида тестирования?", ["пирамид", "юнит"]),
        ("Как работает merge и rebase в Git?", ["merge", "rebase"]),
        ("Чем образ Docker отличается от контейнера?", ["образ", "контейнер"]),
    ]
    for query, expected in cases:
        answer = engine.chat(messages=[{"role": "user", "content": query}])
        assert answer.strip(), query
        assert any(marker in answer for marker in expected), f"{query} -> {answer[:120]}"


def test_chat_comparison_mentions_both_topics() -> None:
    """Вопрос-сравнение получает ответ про обе темы."""
    engine = OfflineEngine()
    answer = engine.chat(
        messages=[{"role": "user", "content": "Индексы vs транзакции: в чём разница?"}]
    )
    assert "индекс" in answer.lower()
    assert "транзакц" in answer.lower()


def test_chat_fallback_is_helpful() -> None:
    """Непонятный вопрос не ломает чат: ответ содержит подсказку по темам."""
    engine = OfflineEngine()
    answer = engine.chat(messages=[{"role": "user", "content": "Расскажи что-нибудь интересное"}])
    assert answer.strip()
    assert "темы" in answer.lower() or "уточните" in answer.lower()


def test_chat_stream_concatenates_to_chat() -> None:
    """Поток состоит из нескольких дельт и склеивается в тот же ответ."""
    engine = OfflineEngine()
    messages = [{"role": "user", "content": "Что такое GIL?"}]
    whole = engine.chat(messages=messages)
    chunks = list(engine.chat_stream(messages=messages))
    assert len(chunks) >= 2
    assert "".join(chunks).strip() == whole.strip()


def test_transcribe_returns_none() -> None:
    """Офлайн-движок не умеет распознавать речь."""
    assert OfflineEngine().transcribe(audio=b"RIFF", filename="audio.wav") is None


def test_extract_json_object_variants() -> None:
    """Парсер JSON понимает markdown-обёртку, массив и мусорный текст вокруг."""
    assert extract_json_object('{"score": 7}') == {"score": 7}
    assert extract_json_object('```json\n{"score": 7}\n```') == {"score": 7}
    assert extract_json_object('Ответ модели: {"score": 7} — готово') == {"score": 7}
    assert extract_json_object("[1, 2, 3]") == {"items": [1, 2, 3]}


def test_llm_client_not_configured_without_key() -> None:
    """Без ключа и без Ollama клиент считается ненастроенным (офлайн-режим)."""
    client = LLMClient(api_key="", base_url="http://127.0.0.1:9/v1", model="test")
    assert client.configured is False
    # ping не должен ходить в сеть, если ключ не задан.
    ok, message = client.ping()
    assert ok is False
    assert message

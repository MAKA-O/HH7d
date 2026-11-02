"""Замер скорости ИИ-слоя (режим определяется текущим backend/.env).

Запуск из корня проекта:
    .venv\\Scripts\\python.exe tools\\ai_benchmark.py

Показывает задержку каждой ИИ-операции: health, генерация вопросов, оценка
ответа, отчёт, код-задача, код-ревью, чат (первый токен и полный ответ).
"""
import logging
import sys
import time
import warnings
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
warnings.filterwarnings("ignore")
logging.basicConfig(level=logging.INFO, format="    %(levelname)s %(message)s")

from app.ai.factory import get_ai_service, reset_ai_service  # noqa: E402
from app.config import settings  # noqa: E402

QUESTION = {
    "id": 0,
    "text": "Что такое индекс в базе данных? Когда он ускоряет запросы, а когда вредит?",
    "topic": "Базы данных и SQL",
    "difficulty": "easy",
    "type": "theory",
    "expected_points": [
        "индекс — структура данных для ускорения поиска",
        "ускоряет WHERE и JOIN",
        "замедляет вставку и обновление",
        "селективность",
    ],
}
ANSWER = (
    "Индекс — это дополнительная структура данных, обычно B-tree, которая ускоряет поиск. "
    "Он помогает в WHERE, JOIN и ORDER BY, но замедляет вставку и обновление и занимает место. "
    "Индексировать стоит селективные поля, например email."
)
REPORT_ITEMS = [
    {
        "question": QUESTION,
        "evaluation": {
            "score": 7.5,
            "criteria": {"correctness": 8, "completeness": 8, "depth": 6, "clarity": 8},
            "strengths": ["Верно объяснена суть индекса"],
            "gaps": ["Не упомянута селективность"],
            "recommendation": "Разобрать селективность индексов",
        },
    }
]


def measure(label: str, fn):
    started = time.perf_counter()
    try:
        result = fn()
        seconds = time.perf_counter() - started
        print(f"  {label:<40} {seconds:6.2f} с")
        return result
    except Exception as exc:  # noqa: BLE001 - бенчмарк должен показать любую ошибку
        seconds = time.perf_counter() - started
        print(f"  {label:<40} {seconds:6.2f} с   ОШИБКА: {exc}")
        return None


def main() -> int:
    reset_ai_service()
    ai = get_ai_service()

    print("=" * 66)
    print("Режим ИИ и параметры")
    print("=" * 66)
    print(f"  provider          : {settings.ai_provider}")
    print(f"  model             : {settings.ai_model}")
    print(f"  base_url          : {settings.ai_base_url}")
    print(f"  reasoning_effort  : {settings.ai_reasoning_effort or '(не задан)'}")
    print(f"  timeout           : {settings.ai_timeout_sec} с")
    print(f"  max_retries       : {settings.ai_max_retries}")

    info = measure("health / ping", lambda: ai.health())
    if info is not None:
        print(f"    -> режим: {info.mode}, provider: {info.provider}, модель: {info.model}")
        if info.latency_ms is not None:
            print(f"    -> задержка ping: {info.latency_ms / 1000:.2f} с")
        print(f"    -> сообщение: {info.message}")

    print()
    print("=" * 66)
    print("Замеры операций")
    print("=" * 66)
    questions = measure(
        "генерация вопросов (3)",
        lambda: ai.generate_questions(
            role="backend", level="junior", mode="mixed", count=3
        ),
    )
    if questions:
        print(f"    -> получено вопросов: {len(questions)}")

    measure(
        "оценка ответа",
        lambda: ai.evaluate_answer(
            question=QUESTION, answer_text=ANSWER, role="backend", level="junior"
        ),
    )
    measure(
        "итоговый отчёт",
        lambda: ai.build_report(
            items=REPORT_ITEMS, role="backend", level="junior", duration_sec=600
        ),
    )
    task = measure(
        "генерация код-задачи",
        lambda: ai.generate_code_task(
            topic=None, language="python", difficulty="easy", role="backend", level="junior"
        ),
    )
    measure(
        "код-ревью",
        lambda: ai.review_code(
            task={"title": task.title, "description": task.description} if task else None,
            code=(
                "def second_largest(nums):\n"
                "    unique = sorted(set(nums))\n"
                "    return unique[-2] if len(unique) > 1 else None\n"
            ),
            language="python",
        ),
    )

    messages = [{"role": "user", "content": "Что такое GIL в Python? Ответь кратко."}]
    measure("чат: полный ответ (без стрима)", lambda: ai.chat(messages=messages))

    started = time.perf_counter()
    first_token_at = None
    try:
        for _chunk in ai.chat_stream(messages=messages):
            if first_token_at is None:
                first_token_at = time.perf_counter() - started
        total = time.perf_counter() - started
        print(f"  {'чат: поток (первый токен)':<40} {first_token_at or 0:6.2f} с")
        print(f"  {'чат: поток (весь ответ)':<40} {total:6.2f} с")
    except Exception as exc:  # noqa: BLE001
        print(f"  {'чат: поток':<40}   ОШИБКА: {exc}")

    print()
    print("Ориентиры (Gemini 3.5 Flash-Lite, проверено на реальном ключе):")
    print("  health ~0.5 с, генерация 3 вопросов 3–4 с, оценка ~2 с,")
    print("  отчёт/код-ревью 1–2 с, чат: первый токен ~0.5 с.")
    print("  При троттлинге бесплатного тарифа отдельные запросы бывают 5–20 с,")
    print("  а в офлайн-режиме все операции занимают десятки миллисекунд.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

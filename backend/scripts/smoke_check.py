"""Сквозная проверка API без запуска сервера (TestClient).

Запуск из папки backend:
    ..\.venv\Scripts\python.exe scripts\smoke_check.py
Проверяет базовый сценарий: регистрация → профиль → собеседование →
ответ с ИИ-оценкой → завершение → аналитика.
"""
import sys
import warnings
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
warnings.filterwarnings("ignore")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

PASSED: list[str] = []
FAILED: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if condition:
        PASSED.append(name)
        print(f"  [OK]   {name}")
    else:
        FAILED.append(f"{name}: {detail}")
        print(f"  [FAIL] {name} {detail}")


def main() -> int:
    client = TestClient(app, raise_server_exceptions=False)

    print("1. Служебные эндпоинты")
    r = client.get("/api/health")
    check("GET /api/health", r.status_code == 200 and r.json()["status"] == "ok")
    r = client.get("/api/meta")
    meta = r.json() if r.status_code == 200 else {}
    check("GET /api/meta", r.status_code == 200 and len(meta.get("roles", [])) == 6)

    print("2. Аутентификация")
    email = "smoke_check@trainer.local"
    r = client.post(
        "/api/auth/register",
        json={"email": email, "password": "secret123", "full_name": "Проверка"},
    )
    if r.status_code == 400:  # уже зарегистрирован
        r = client.post("/api/auth/login", json={"email": email, "password": "secret123"})
    check("POST /api/auth/register|login", r.status_code in (200, 201), r.text[:200])
    token = r.json().get("access_token", "")
    headers = {"Authorization": f"Bearer {token}"}
    check("GET /api/auth/me", client.get("/api/auth/me", headers=headers).status_code == 200)
    r = client.put(
        "/api/profile",
        headers=headers,
        json={"target_role": "backend", "target_level": "middle"},
    )
    check("PUT /api/profile", r.status_code == 200 and r.json()["target_role"] == "backend")

    print("3. Собеседование")
    r = client.post(
        "/api/interviews",
        headers=headers,
        json={"role": "backend", "level": "junior", "mode": "mixed", "question_count": 5},
    )
    check("POST /api/interviews", r.status_code == 201, r.text[:300])
    if r.status_code != 201:
        return report()
    session = r.json()
    questions = session["questions"]
    check("вопросы сгенерированы (5)", len(questions) == 5, str(len(questions)))
    check(
        "поля вопроса корректны",
        all(q["text"] and q["topic"] and q["difficulty"] for q in questions),
    )

    question = questions[0]
    answer_text = (
        "Это структура данных, которая ускоряет поиск — например B-tree. "
        "Индекс помогает WHERE и JOIN, но замедляет вставку и обновление, "
        "поэтому индексировать нужно селективные поля. Пример: поиск по email."
    )
    r = client.post(
        f"/api/interviews/{session['id']}/answers",
        headers=headers,
        json={"question_id": question["id"], "text": answer_text, "time_spent_sec": 90},
    )
    check("POST /answers (ИИ-оценка)", r.status_code == 200, r.text[:300])
    if r.status_code == 200:
        evaluation = r.json()["evaluation"]
        check("score в диапазоне 0..10", 0 <= evaluation["score"] <= 10, str(evaluation.get("score")))
        check(
            "criteria заполнены",
            all(key in evaluation["criteria"] for key in
                ("correctness", "completeness", "depth", "clarity")),
            str(evaluation["criteria"]),
        )
        check("есть эталонный ответ", bool(evaluation["ideal_answer"]))
        check("есть рекомендация", bool(evaluation["recommendation"]))

    r = client.post(f"/api/interviews/{session['id']}/finish", headers=headers)
    check("POST /finish", r.status_code == 200, r.text[:300])
    if r.status_code == 200:
        report_data = r.json().get("report") or {}
        check("отчёт собран", bool(report_data.get("verdict")) and "topic_scores" in report_data)

    print("4. Аналитика")
    r = client.get("/api/analytics/overview", headers=headers)
    analytics = r.json() if r.status_code == 200 else {}
    check("GET /api/analytics/overview", r.status_code == 200)
    check("сессии учтены", analytics.get("sessions_count", 0) >= 1, str(analytics.get("sessions_count")))
    check("вопросы учтены", analytics.get("questions_answered", 0) >= 1)

    print("5. Чат и код")
    r = client.post("/api/chat/conversations", headers=headers, json={"title": "Индексы"})
    check("POST /api/chat/conversations", r.status_code == 201, r.text[:200])
    if r.status_code == 201:
        conversation_id = r.json()["id"]
        r = client.post(
            f"/api/chat/conversations/{conversation_id}/messages",
            headers=headers,
            json={"content": "Что такое индекс в базе данных?", "stream": False},
        )
        check("POST /chat/messages (без стрима)", r.status_code == 200, r.text[:200])
        check("ответ ассистента не пустой", r.status_code == 200 and bool(
            r.json()["assistant_message"]["content"]))
        with client.stream(
            "POST",
            f"/api/chat/conversations/{conversation_id}/messages",
            headers=headers,
            json={"content": "А что такое транзакция?", "stream": True},
        ) as stream:
            body = "".join(chunk for chunk in stream.iter_text())
        check("POST /chat/messages (SSE)", "delta" in body or "done" in body, body[:120])

    r = client.post(
        "/api/code/tasks",
        headers=headers,
        json={"topic": "Алгоритмы и структуры данных", "language": "python", "difficulty": "easy"},
    )
    check("POST /api/code/tasks", r.status_code == 201, r.text[:200])
    if r.status_code == 201:
        task_id = r.json()["id"]
        r = client.post(
            f"/api/code/tasks/{task_id}/review",
            headers=headers,
            json={"code": "def second_largest(nums):\n    seen = sorted(set(nums))\n    return seen[-2] if len(seen) > 1 else None\n"},
        )
        check("POST /api/code/tasks/{id}/review", r.status_code == 200, r.text[:200])
        if r.status_code == 200:
            review = r.json()
            check("ревью непустое", bool(review.get("verdict")) and 0 <= review["score"] <= 10)

    r = client.get("/api/ai/health", headers=headers)
    check("GET /api/ai/health", r.status_code == 200, r.text[:200])
    if r.status_code == 200:
        print(f"  [i]    ИИ: режим={r.json()['mode']}, провайдер={r.json()['provider']}")

    return report()


def report() -> int:
    print(f"\nИтого: пройдено {len(PASSED)}, провалено {len(FAILED)}")
    for failure in FAILED:
        print(f"  ✗ {failure}")
    return 0 if not FAILED else 1


if __name__ == "__main__":
    sys.exit(main())

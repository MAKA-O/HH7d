"""Проверка живого сервера по HTTP (не TestClient): API + статика + SSE.

Запуск:  .venv\\Scripts\\python.exe tools\\live_check.py [base_url]
По умолчанию base_url = http://127.0.0.1:8100
"""
import json
import random
import string
import sys

import httpx

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8100"
ok: list[str] = []
failed: list[str] = []


def check(name: str, cond: bool, detail: str = "") -> None:
    if cond:
        ok.append(name)
        print(f"  [OK]   {name}")
    else:
        failed.append(f"{name} {detail}")
        print(f"  [FAIL] {name} {detail}")


def main() -> int:
    client = httpx.Client(base_url=BASE, timeout=60)
    suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=6))
    email = f"live_{suffix}@trainer.local"

    print("1. Публичные методы и статика")
    r = client.get("/api/health")
    check("GET /api/health", r.status_code == 200 and r.json().get("status") == "ok", r.text[:100])
    r = client.get("/api/meta")
    check("GET /api/meta", r.status_code == 200 and len(r.json()["roles"]) == 6)
    r = client.get("/api/docs")
    check("GET /api/docs (Swagger)", r.status_code == 200 and "swagger" in r.text.lower())
    r = client.get("/")
    check("SPA index отдаётся", r.status_code == 200 and 'id="root"' in r.text)
    asset = None
    for token in r.text.split('"'):
        if token.startswith("/assets/") and token.endswith(".js"):
            asset = token
            break
    if asset:
        r = client.get(asset)
        check("JS-бандл доступен", r.status_code == 200 and len(r.content) > 100_000, asset)
    else:
        check("JS-бандл в index.html", False, "ссылка на /assets/*.js не найдена")
    r = client.get("/login")
    check("SPA-fallback на клиентский маршрут", r.status_code == 200 and 'id="root"' in r.text)

    print("2. Аутентификация")
    r = client.post(
        "/api/auth/register",
        json={"email": email, "password": "secret123", "full_name": "Живой тест"},
    )
    check("POST /api/auth/register", r.status_code == 201, r.text[:150])
    token = r.json()["access_token"]
    client.headers["Authorization"] = f"Bearer {token}"
    check("GET /api/auth/me", client.get("/api/auth/me").status_code == 200)
    r = client.put("/api/profile", json={"target_role": "backend", "target_level": "middle"})
    check("PUT /api/profile", r.status_code == 200 and r.json()["target_level"] == "middle")

    print("3. Собеседование (полный цикл)")
    r = client.post(
        "/api/interviews",
        json={"role": "backend", "level": "junior", "mode": "mixed", "question_count": 4},
    )
    check("POST /api/interviews", r.status_code == 201, r.text[:200])
    session = r.json()
    check("4 вопроса", len(session["questions"]) == 4)
    question = session["questions"][0]
    answer_text = (
        "Индекс — структура данных для ускорения поиска, обычно B-tree. "
        "Он ускоряет WHERE и JOIN, но замедляет вставку и занимает память. "
        "Индексировать стоит селективные поля, например email."
    )
    r = client.post(
        f"/api/interviews/{session['id']}/answers",
        json={"question_id": question["id"], "text": answer_text, "time_spent_sec": 75},
    )
    check("POST /answers", r.status_code == 200, r.text[:200])
    if r.status_code == 200:
        evaluation = r.json()["evaluation"]
        check("score 0..10", 0 <= evaluation["score"] <= 10)
        check("4 критерия", len(evaluation["criteria"]) == 4)
        check("эталон + рекомендация", bool(evaluation["ideal_answer"]) and bool(evaluation["recommendation"]))
    r = client.post(f"/api/interviews/{session['id']}/questions/next")
    check("POST /questions/next", r.status_code == 201, r.text[:150])
    r = client.post(f"/api/interviews/{session['id']}/finish")
    check("POST /finish", r.status_code == 200, r.text[:200])
    check("отчёт собран", bool((r.json().get("report") or {}).get("verdict")))
    r = client.get("/api/interviews")
    check("GET /api/interviews", r.status_code == 200 and r.json()["total"] >= 1)

    print("4. Аналитика")
    r = client.get("/api/analytics/overview")
    data = r.json() if r.status_code == 200 else {}
    check("GET /api/analytics/overview", r.status_code == 200)
    check("агрегаты не пустые", data.get("sessions_count", 0) >= 1 and data.get("questions_answered", 0) >= 1)

    print("5. Чат (JSON + SSE)")
    r = client.post("/api/chat/conversations", json={"title": "Что такое GIL?"})
    check("POST /api/chat/conversations", r.status_code == 201, r.text[:150])
    conversation_id = r.json()["id"]
    r = client.post(
        f"/api/chat/conversations/{conversation_id}/messages",
        json={"content": "Что такое GIL в Python?", "stream": False},
    )
    check("чат без стрима", r.status_code == 200 and bool(r.json()["assistant_message"]["content"]))
    if r.status_code == 200:
        answer = r.json()["assistant_message"]["content"]
        check("ответ про GIL, а не про list/tuple", "gil" in answer.lower() or "интерпретатор" in answer.lower(), answer[:120])

    events: list[str] = []
    with client.stream(
        "POST",
        f"/api/chat/conversations/{conversation_id}/messages",
        json={"content": "А что такое транзакция?", "stream": True},
    ) as stream:
        for line in stream.iter_lines():
            if line.strip():
                events.append(line.strip())
    joined = "\n".join(events)
    check("SSE: есть delta", '"delta"' in joined)
    check("SSE: есть done с message_id", '"done"' in joined and "message_id" in joined)
    check("SSE: есть [DONE]", "data: [DONE]" in joined, joined[-120:])

    print("6. Код и ИИ-здоровье")
    r = client.post(
        "/api/code/tasks",
        json={"topic": "Алгоритмы и структуры данных", "language": "python", "difficulty": "medium"},
    )
    check("POST /api/code/tasks", r.status_code == 201, r.text[:150])
    task_id = r.json()["id"]
    good_code = (
        "def second_largest(nums: list[int]) -> int | None:\n"
        "    unique = sorted(set(nums))\n"
        "    return unique[-2] if len(unique) > 1 else None\n"
    )
    r = client.post(f"/api/code/tasks/{task_id}/review", json={"code": good_code})
    check("POST /code review", r.status_code == 200, r.text[:150])
    if r.status_code == 200:
        review = r.json()
        check("ревью содержит поля", 0 <= review["score"] <= 10 and bool(review["verdict"]))
    r = client.get("/api/code/history")
    check("GET /api/code/history", r.status_code == 200 and r.json()["total"] >= 1)
    r = client.get("/api/ai/health")
    check("GET /api/ai/health", r.status_code == 200 and r.json()["mode"] in ("live", "offline"))
    if r.status_code == 200:
        print(f"  [i]    ИИ-режим: {r.json()['mode']} ({r.json()['provider']}/{r.json()['model']})")

    print(f"\nИтого: пройдено {len(ok)}, провалено {len(failed)}")
    for item in failed:
        print(f"  ✗ {item}")
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())

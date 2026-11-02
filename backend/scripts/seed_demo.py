"""Идемпотентные демо-данные для защиты проекта.

Запуск из папки ``backend``::

    ..\\.venv\\Scripts\\python.exe scripts\\seed_demo.py

Скрипт создаёт (или полностью пересоздаёт) данные демо-пользователя
``demo@trainer.ru`` / ``demo1234``:

* 3 завершённых собеседования с оценками и отчётами за последние 10 дней;
* 2 диалога чат-ассистента с историей сообщений;
* 2 записи код-ревью (Python и SQL).

Повторный запуск не дублирует данные: связанные записи демо-пользователя
удаляются и создаются заново. Реальные пользователи не затрагиваются.
"""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.data.question_bank import pick_code_task, pick_questions  # noqa: E402
from app.db import SessionLocal, init_db  # noqa: E402
from app.models import (  # noqa: E402
    Answer,
    ChatConversation,
    ChatMessage,
    CodeSubmission,
    CodeTask,
    Evaluation,
    InterviewSession,
    Question,
    User,
)
from app.security import hash_password  # noqa: E402

DEMO_EMAIL = "demo@trainer.ru"
DEMO_PASSWORD = "demo1234"
DEMO_FULL_NAME = "Алексей Смирнов"

CRITERIA_NAMES = ("correctness", "completeness", "depth", "clarity")


def _now() -> datetime:
    """Наивное UTC-время — так же, как в остальном приложении."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _clamp(value: float) -> float:
    return round(max(0.0, min(10.0, value)), 1)


def _criteria(score: float) -> dict[str, float]:
    """Согласованные критерии вокруг интегральной оценки."""
    return {
        "correctness": _clamp(score + 0.4),
        "completeness": _clamp(score - 0.2),
        "depth": _clamp(score - 0.7),
        "clarity": _clamp(score + 0.5),
    }


def _ideal_answer(question: Question) -> str:
    points = list(question.expected_points or [])
    if not points:
        return question.text
    return " ".join(f"{index}. {point}." for index, point in enumerate(points, start=1))


def _answer_text(question: Question) -> str:
    points = list(question.expected_points or [])
    if not points:
        return "Отвечу по существу: в целом механизм понятен, привожу пример из практики."
    first = points[0]
    second = points[1] if len(points) > 1 else ""
    tail = (
        "На практике сталкивался с этим в рабочем проекте и учитываю ограничения."
        if len(points) <= 2
        else f"На практике сталкивался с этим в проекте: {points[-1].lower()}."
    )
    return f"{first}. {second}. {tail}".strip()


# ------------------------------------------------------------------ сценарии
SESSION_PLANS: list[dict[str, Any]] = [
    {
        "role": "backend",
        "level": "junior",
        "mode": "mixed",
        "question_count": 5,
        "days_ago": 9,
        "hour": 11,
        "scores": [6.0, 7.5, 6.0, 7.0, 5.5],
        "duration_sec": 1_140,
        "verdict": "Хороший уровень: база есть, но отдельным темам не хватает глубины.",
        "recommendations": [
            "Повторите уровни изоляции транзакций и аномалии чтения.",
            "Разберите сложность алгоритмов на конкретных примерах.",
            "Тренируйте ответы по схеме «определение → пример → ограничения».",
        ],
    },
    {
        "role": "backend",
        "level": "middle",
        "mode": "theory",
        "question_count": 6,
        "days_ago": 5,
        "hour": 18,
        "scores": [8.5, 9.0, 8.0, 7.5, 8.5, 8.0],
        "duration_sec": 1_320,
        "verdict": "Уверенный уровень middle: ответы полные, с примерами и компромиссами.",
        "recommendations": [
            "Добавьте в ответы больше цифр и метрик из реальных проектов.",
            "Подготовьте рассказ о самом сложном техническом решении.",
        ],
    },
    {
        "role": "qa",
        "level": "junior",
        "mode": "mixed",
        "question_count": 4,
        "days_ago": 2,
        "hour": 10,
        "scores": [7.0, 6.5, 8.0, 7.0],
        "duration_sec": 900,
        "verdict": "Крепкий junior QA: техники тест-дизайна применяете осознанно.",
        "recommendations": [
            "Потренируйте API-тестирование: коды ответов и идемпотентность.",
            "Составляйте чек-листы для регрессионного тестирования заранее.",
        ],
    },
]

CHAT_PLANS: list[dict[str, Any]] = [
    {
        "title": "Индексы в PostgreSQL",
        "days_ago": 7,
        "messages": [
            (
                "user",
                "Что такое индекс в PostgreSQL и когда он вредит?",
            ),
            (
                "assistant",
                "Индекс — это дополнительная структура данных (B-tree, GIN, BRIN и другие), "
                "которая ускоряет поиск, соединения и сортировку по колонке. Он вредит, когда "
                "запросов на запись больше, чем на чтение: каждая вставка и обновление "
                "обновляют и индекс, а место на диске растёт. Индексировать стоит селективные "
                "поля, которые часто используются в WHERE и JOIN.",
            ),
            (
                "user",
                "А как понять, что индекс реально используется?",
            ),
            (
                "assistant",
                "Посмотрите план через EXPLAIN ANALYZE: в нём будет Index Scan или Bitmap Index Scan "
                "вместо Seq Scan. Ещё помогает статистика pg_stat_user_indexes — по idx_scan видно, "
                "сколько раз индекс применялся. Если idx_scan близок к нулю, а запись в таблицу "
                "активная, индекс стоит пересмотреть.",
            ),
        ],
    },
    {
        "title": "Готовимся к алгоритмическому блоку",
        "days_ago": 3,
        "messages": [
            (
                "user",
                "Как быстро определять сложность алгоритма на собеседовании?",
            ),
            (
                "assistant",
                "Смотрите на структуру кода: один проход по массиву — O(n), вложенные циклы по "
                "тому же массиву — O(n²), деление задачи пополам с линейным проходом — O(n log n). "
                "Далее называйте не только время, но и память: рекурсия и хеш-таблицы её тратят. "
                "Хорошая привычка — сразу проговорить ограничения и крайние случаи.",
            ),
            (
                "user",
                "Что чаще всего забывают в задачах со скользящим окном?",
            ),
            (
                "assistant",
                "Забывают двигать левую границу при нарушении условия и обновлять структуру "
                "подсчёта (например, хеш-таблицу) синхронно с окном. Ещё одна частая ошибка — "
                "неверная сложность из-за вложенного while: важно объяснить, что каждый элемент "
                "входит в окно и выходит из него не более одного раза, поэтому суммарно O(n).",
            ),
        ],
    },
]

CODE_PLANS: list[dict[str, Any]] = [
    {
        "days_ago": 6,
        "hour": 20,
        "language": "python",
        "difficulty": "medium",
        "code": (
            "def merge_sorted(a, b):\n"
            "    result = []\n"
            "    i = j = 0\n"
            "    while i < len(a) and j < len(b):\n"
            "        if a[i] <= b[j]:\n"
            "            result.append(a[i])\n"
            "            i += 1\n"
            "        else:\n"
            "            result.append(b[j])\n"
            "            j += 1\n"
            "    result.extend(a[i:])\n"
            "    result.extend(b[j:])\n"
            "    return result\n"
        ),
        "score": 8.0,
        "verdict": "Аккуратное решение за O(n + m): два указателя и корректная обработка остатков.",
        "correctness_notes": (
            "Краевые случаи с пустыми массивами обрабатываются естественно. "
            "Стоит добавить type hints и docstring."
        ),
        "issues": [
            {
                "severity": "minor",
                "title": "Нет type hints",
                "detail": "Добавьте аннотации list[int] и возвращаемого типа — это улучшает читаемость.",
            },
            {
                "severity": "nit",
                "title": "Не указана сложность",
                "detail": "В docstring стоит зафиксировать O(n + m) по времени и O(n + m) по памяти.",
            },
        ],
        "improved_code": (
            "def merge_sorted(a: list[int], b: list[int]) -> list[int]:\n"
            '    """Слияние двух отсортированных массивов за O(n + m)."""\n'
            "    result: list[int] = []\n"
            "    i = j = 0\n"
            "    while i < len(a) and j < len(b):\n"
            "        if a[i] <= b[j]:\n"
            "            result.append(a[i])\n"
            "            i += 1\n"
            "        else:\n"
            "            result.append(b[j])\n"
            "            j += 1\n"
            "    result.extend(a[i:])\n"
            "    result.extend(b[j:])\n"
            "    return result\n"
        ),
        "time_complexity": "O(n + m)",
        "space_complexity": "O(n + m)",
    },
    {
        "days_ago": 2,
        "hour": 15,
        "language": "sql",
        "difficulty": "medium",
        "code": (
            "SELECT u.city, COUNT(o.id) AS orders_count, COALESCE(SUM(o.amount), 0) AS total\n"
            "FROM users u\n"
            "LEFT JOIN orders o ON o.user_id = u.id\n"
            "WHERE o.created_at >= NOW() - INTERVAL '30 days'\n"
            "GROUP BY u.city;\n"
        ),
        "score": 6.0,
        "verdict": "Логика верная, но фильтр по дате в WHERE превращает LEFT JOIN в INNER JOIN.",
        "correctness_notes": (
            "Города без заказов за последние 30 дней пропадут из результата, потому что "
            "условие по orders в WHERE отбрасывает строки с NULL."
        ),
        "issues": [
            {
                "severity": "critical",
                "title": "Фильтр по дате в WHERE ломает LEFT JOIN",
                "detail": "Перенесите условие по created_at в ON, чтобы сохранить города без заказов.",
            },
            {
                "severity": "minor",
                "title": "Нет сортировки",
                "detail": "Для отчёта полезно отсортировать по total DESC.",
            },
        ],
        "improved_code": (
            "SELECT u.city,\n"
            "       COUNT(o.id) AS orders_count,\n"
            "       COALESCE(SUM(o.amount), 0) AS total\n"
            "FROM users u\n"
            "LEFT JOIN orders o\n"
            "       ON o.user_id = u.id\n"
            "      AND o.created_at >= NOW() - INTERVAL '30 days'\n"
            "GROUP BY u.city\n"
            "ORDER BY total DESC;\n"
        ),
        "time_complexity": "O(n + m)",
        "space_complexity": "O(cities)",
    },
]


# ------------------------------------------------------------------ создание
def _reset_demo_data(db: Session, user: User) -> None:
    """Удаляет только связанные с демо-пользователем данные."""
    for session in db.scalars(
        select(InterviewSession).where(InterviewSession.user_id == user.id)
    ).all():
        db.delete(session)
    for conversation in db.scalars(
        select(ChatConversation).where(ChatConversation.user_id == user.id)
    ).all():
        db.delete(conversation)
    for task in db.scalars(select(CodeTask).where(CodeTask.user_id == user.id)).all():
        db.delete(task)
    for submission in db.scalars(
        select(CodeSubmission).where(CodeSubmission.user_id == user.id)
    ).all():
        db.delete(submission)
    db.flush()


def _ensure_demo_user(db: Session) -> User:
    user = db.scalar(select(User).where(User.email == DEMO_EMAIL))
    if user is None:
        user = User(email=DEMO_EMAIL, password_hash=hash_password(DEMO_PASSWORD))
        db.add(user)
        db.flush()
    else:
        _reset_demo_data(db, user)
    user.full_name = DEMO_FULL_NAME
    user.target_role = "backend"
    user.target_level = "middle"
    user.resume_text = (
        "Начинающий backend-разработчик: Python, FastAPI, PostgreSQL, Docker. "
        "Хочу вырасти до уверенного middle и закрыть пробелы в алгоритмах и проектировании."
    )
    db.flush()
    return user


def _seed_session(db: Session, user: User, plan: dict[str, Any]) -> InterviewSession:
    started_at = _now() - timedelta(days=plan["days_ago"], hours=max(0, 20 - plan["hour"]))
    questions_data = pick_questions(
        role=plan["role"],
        level=plan["level"],
        mode=plan["mode"],
        count=plan["question_count"],
    )
    session = InterviewSession(
        user_id=user.id,
        role=plan["role"],
        level=plan["level"],
        mode=plan["mode"],
        status="in_progress",
        question_count=len(questions_data),
        started_at=started_at,
    )
    db.add(session)
    db.flush()

    answers: list[Answer] = []
    evaluations: list[Evaluation] = []
    for index, item in enumerate(questions_data):
        question = Question(
            session_id=session.id,
            order_index=index,
            type=item["type"],
            topic=item["topic"],
            difficulty=item["difficulty"],
            text=item["text"],
            expected_points=list(item["expected_points"]),
            starter_code=item.get("starter_code"),
            language=item.get("language"),
            source="bank",
        )
        db.add(question)
        db.flush()

        score = float(plan["scores"][index % len(plan["scores"])])
        answered_at = started_at + timedelta(minutes=4 * (index + 1))
        answer = Answer(
            question_id=question.id,
            session_id=session.id,
            user_id=user.id,
            text=_answer_text(question),
            time_spent_sec=75 + 15 * index,
            created_at=answered_at,
        )
        db.add(answer)
        db.flush()

        points = list(question.expected_points or [])
        evaluation = Evaluation(
            answer_id=answer.id,
            question_id=question.id,
            session_id=session.id,
            score=score,
            criteria=_criteria(score),
            strengths=[f"Верно раскрыто: {points[0]}."] if points else ["Ответ по существу."],
            gaps=[f"Стоит подробнее: {points[-1]}."] if len(points) > 1 else [],
            ideal_answer=_ideal_answer(question),
            recommendation=(
                f"Повторите тему «{question.topic}» и добавьте в ответ конкретный пример."
            ),
            follow_up_question=(
                f"А какие ограничения есть у подхода в теме «{question.topic}»?"
                if index % 2 == 0
                else None
            ),
            created_at=answered_at + timedelta(seconds=20),
        )
        db.add(evaluation)
        answers.append(answer)
        evaluations.append(evaluation)

    overall = round(sum(item.score for item in evaluations) / len(evaluations), 1)
    topic_scores: dict[str, list[float]] = {}
    gaps: list[str] = []
    strengths: list[str] = []
    for evaluation in evaluations:
        question = db.get(Question, evaluation.question_id)
        topic = question.topic if question else "Общее"
        topic_scores.setdefault(topic, []).append(evaluation.score)
        gaps.extend(str(gap) for gap in (evaluation.gaps or []))
        strengths.extend(str(item) for item in (evaluation.strengths or []))

    session.overall_score = overall
    session.duration_sec = plan["duration_sec"]
    session.finished_at = started_at + timedelta(seconds=plan["duration_sec"])
    session.report = {
        "overall_score": overall,
        "verdict": plan["verdict"],
        "strengths": list(dict.fromkeys(strengths))[:5],
        "gaps": list(dict.fromkeys(gaps))[:5],
        "recommendations": plan["recommendations"],
        "topic_scores": {topic: round(sum(values) / len(values), 1) for topic, values in topic_scores.items()},
        "answered_count": len(evaluations),
        "duration_sec": plan["duration_sec"],
    }
    session.status = "completed"
    return session


def _seed_chats(db: Session, user: User) -> list[ChatConversation]:
    conversations: list[ChatConversation] = []
    for plan in CHAT_PLANS:
        base = _now() - timedelta(days=plan["days_ago"])
        conversation = ChatConversation(
            user_id=user.id,
            title=plan["title"],
            created_at=base,
            updated_at=base + timedelta(minutes=2 * len(plan["messages"])),
        )
        db.add(conversation)
        db.flush()
        for index, (role, content) in enumerate(plan["messages"]):
            db.add(
                ChatMessage(
                    conversation_id=conversation.id,
                    role=role,
                    content=content,
                    created_at=base + timedelta(minutes=2 * index),
                )
            )
        conversations.append(conversation)
    return conversations


def _seed_code_reviews(db: Session, user: User) -> list[CodeSubmission]:
    submissions: list[CodeSubmission] = []
    for plan in CODE_PLANS:
        task_data = pick_code_task(
            topic=None,
            language=plan["language"],
            difficulty=plan["difficulty"],
        )
        created_at = _now() - timedelta(days=plan["days_ago"], hours=max(0, 20 - plan["hour"]))
        task = CodeTask(
            user_id=user.id,
            topic=task_data["topic"],
            language=task_data["language"],
            difficulty=task_data["difficulty"],
            title=task_data["title"],
            description=task_data["description"],
            starter_code=task_data["starter_code"],
            hints=list(task_data["hints"]),
            source="bank",
            created_at=created_at,
        )
        db.add(task)
        db.flush()
        review = {
            "score": plan["score"],
            "verdict": plan["verdict"],
            "correctness_notes": plan["correctness_notes"],
            "issues": plan["issues"],
            "improved_code": plan["improved_code"],
            "time_complexity": plan["time_complexity"],
            "space_complexity": plan["space_complexity"],
        }
        submission = CodeSubmission(
            task_id=task.id,
            user_id=user.id,
            language=task.language,
            code=plan["code"],
            score=plan["score"],
            review=review,
            created_at=created_at + timedelta(minutes=15),
        )
        db.add(submission)
        submissions.append(submission)
    return submissions


def seed() -> dict[str, Any]:
    """Создаёт демо-данные и возвращает краткую сводку."""
    init_db()
    db = SessionLocal()
    try:
        user = _ensure_demo_user(db)
        sessions = [_seed_session(db, user, plan) for plan in SESSION_PLANS]
        conversations = _seed_chats(db, user)
        submissions = _seed_code_reviews(db, user)
        db.commit()
        return {
            "user_id": user.id,
            "email": DEMO_EMAIL,
            "password": DEMO_PASSWORD,
            "sessions": [
                {
                    "id": session.id,
                    "role": session.role,
                    "level": session.level,
                    "score": session.overall_score,
                    "started_at": session.started_at.isoformat(sep=" "),
                }
                for session in sessions
            ],
            "conversations": [{"id": item.id, "title": item.title} for item in conversations],
            "code_reviews": [{"task_id": item.task_id, "score": item.score} for item in submissions],
        }
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> int:
    summary = seed()
    print("Демо-данные созданы (идемпотентно).")
    print(f"  Пользователь: {summary['email']} / {summary['password']} (id={summary['user_id']})")
    print("  Завершённые собеседования:")
    for session in summary["sessions"]:
        print(
            f"    #{session['id']} — {session['role']}/{session['level']}, "
            f"балл {session['score']}, начало {session['started_at']}"
        )
    print("  Диалоги чата:")
    for conversation in summary["conversations"]:
        print(f"    #{conversation['id']} — {conversation['title']}")
    print("  Код-ревью:")
    for review in summary["code_reviews"]:
        print(f"    задача #{review['task_id']}, балл {review['score']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

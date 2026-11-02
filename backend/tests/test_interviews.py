"""Тесты собеседований: создание, ответы, ИИ-оценка, отчёт, изоляция."""
import pytest
from sqlalchemy import func, select

from app.models import Answer, Evaluation
from tests.conftest import create_interview, submit_answer

VALID_FIELDS = {"score", "criteria", "strengths", "gaps", "ideal_answer", "recommendation"}
CRITERIA_KEYS = {"correctness", "completeness", "depth", "clarity"}


def _assert_evaluation(evaluation: dict) -> None:
    assert VALID_FIELDS <= set(evaluation)
    assert isinstance(evaluation["score"], (int, float))
    assert 0 <= evaluation["score"] <= 10
    criteria = evaluation["criteria"]
    assert CRITERIA_KEYS <= set(criteria), f"нет критериев: {CRITERIA_KEYS - set(criteria)}"
    for name, value in criteria.items():
        assert isinstance(value, (int, float)), f"{name} не число"
        assert 0 <= value <= 10, f"{name}={value} вне диапазона"
    assert isinstance(evaluation["strengths"], list)
    assert isinstance(evaluation["gaps"], list)
    assert evaluation["ideal_answer"].strip(), "пустой эталонный ответ"
    assert evaluation["recommendation"].strip(), "пустая рекомендация"


def test_create_mixed_interview(client, user_headers):
    session = create_interview(client, user_headers, question_count=5)
    assert session["status"] == "in_progress"
    assert session["role"] == "backend"
    assert session["level"] == "junior"
    assert session["mode"] == "mixed"
    assert session["question_count"] == 5
    assert session["answered_count"] == 0
    assert session["overall_score"] is None
    assert session["finished_at"] is None
    assert session["started_at"]

    questions = session["questions"]
    assert len(questions) == 5
    assert len({question["id"] for question in questions}) == 5
    for index, question in enumerate(questions):
        assert question["order_index"] == index
        assert question["text"].strip()
        assert question["topic"].strip()
        assert question["difficulty"] in {"easy", "medium", "hard"}
        assert question["type"] in {"theory", "code"}
    assert session["answers"] == []


def test_create_theory_interview_contains_only_theory(client, user_headers):
    session = create_interview(
        client, user_headers, role="frontend", level="middle", mode="theory", question_count=4
    )
    assert session["mode"] == "theory"
    assert len(session["questions"]) == 4
    assert all(question["type"] == "theory" for question in session["questions"])


def test_create_code_interview_contains_code_question(client, user_headers):
    session = create_interview(
        client, user_headers, role="backend", level="middle", mode="code", question_count=5
    )
    code_questions = [q for q in session["questions"] if q["type"] == "code"]
    assert code_questions, "в режиме code нет ни одной задачи с кодом"
    for question in code_questions:
        assert question["starter_code"]
        assert question["language"]


def test_create_interview_with_focus_topics(client, user_headers):
    session = create_interview(
        client,
        user_headers,
        role="backend",
        level="junior",
        mode="theory",
        question_count=5,
        focus_topics=["Python"],
    )
    topics = [question["topic"] for question in session["questions"]]
    assert "Python" in topics


@pytest.mark.parametrize("question_count", [2, 16])
def test_invalid_question_count_returns_422(client, user_headers, question_count):
    response = client.post(
        "/api/interviews",
        headers=user_headers,
        json={"role": "backend", "level": "junior", "mode": "mixed", "question_count": question_count},
    )
    assert response.status_code == 422


def test_answer_returns_evaluation(client, user_headers):
    session = create_interview(client, user_headers, question_count=3)
    question = session["questions"][0]
    result = submit_answer(client, user_headers, session["id"], question["id"], time_spent_sec=95)

    answer = result["answer"]
    assert answer["question_id"] == question["id"]
    assert answer["text"].strip()
    assert answer["time_spent_sec"] == 95
    assert answer["created_at"]
    _assert_evaluation(result["evaluation"])
    assert result["evaluation"]["answer_id"] == answer["id"]
    assert result["evaluation"]["question_id"] == question["id"]


def test_answer_score_stays_in_range_for_weak_and_strong_answers(client, user_headers):
    session = create_interview(client, user_headers, question_count=3)
    first, second = session["questions"][0], session["questions"][1]

    weak = submit_answer(client, user_headers, session["id"], first["id"], text="Не знаю.")
    strong = submit_answer(
        client,
        user_headers,
        session["id"],
        second["id"],
        text=(
            "Это структура данных (обычно B-tree), которая ускоряет поиск по колонке. "
            "Индекс помогает в WHERE, JOIN и ORDER BY, потому что позволяет не читать всю таблицу. "
            "Он вредит на вставке и обновлении: каждый DML обновляет и индекс, плюс расход диска. "
            "Поэтому индексируют селективные поля с высокой кардинальностью, например email. "
            "Проверяю эффективность через EXPLAIN ANALYZE и pg_stat_user_indexes."
        ),
    )
    _assert_evaluation(weak["evaluation"])
    _assert_evaluation(strong["evaluation"])


def test_repeated_answer_overwrites(client, user, db_session):
    session = create_interview(client, user["headers"], question_count=3)
    question = session["questions"][0]

    first = submit_answer(client, user["headers"], session["id"], question["id"], text="Первый ответ.")
    answer_id = first["answer"]["id"]
    second = submit_answer(
        client,
        user["headers"],
        session["id"],
        question["id"],
        text="Второй, более полный ответ на тот же вопрос.",
        time_spent_sec=120,
    )
    assert second["answer"]["id"] == first["answer"]["id"]
    assert second["answer"]["text"] == "Второй, более полный ответ на тот же вопрос."
    assert second["answer"]["time_spent_sec"] == 120
    assert second["evaluation"]["answer_id"] == answer_id == first["evaluation"]["answer_id"]

    detail = client.get(f"/api/interviews/{session['id']}", headers=user["headers"]).json()
    assert len(detail["answers"]) == 1
    assert detail["answers"][0]["answer"]["text"] == "Второй, более полный ответ на тот же вопрос."
    assert detail["answered_count"] == 1

    answers_count = db_session.scalar(
        select(func.count()).select_from(Answer).where(Answer.question_id == question["id"])
    )
    evaluations_count = db_session.scalar(
        select(func.count()).select_from(Evaluation).where(Evaluation.question_id == question["id"])
    )
    assert answers_count == 1
    assert evaluations_count == 1


def test_answer_with_foreign_question_returns_400(client, user_headers):
    first = create_interview(client, user_headers, question_count=3)
    second = create_interview(client, user_headers, question_count=3)
    foreign_question_id = second["questions"][0]["id"]
    response = client.post(
        f"/api/interviews/{first['id']}/answers",
        headers=user_headers,
        json={"question_id": foreign_question_id, "text": "Ответ не на тот вопрос.", "time_spent_sec": 10},
    )
    assert response.status_code == 400


def test_empty_answer_rejected(client, user_headers):
    session = create_interview(client, user_headers, question_count=3)
    question = session["questions"][0]

    response = client.post(
        f"/api/interviews/{session['id']}/answers",
        headers=user_headers,
        json={"question_id": question["id"], "text": "   ", "time_spent_sec": 5},
    )
    assert response.status_code == 400

    response = client.post(
        f"/api/interviews/{session['id']}/answers",
        headers=user_headers,
        json={"question_id": question["id"], "text": ""},
    )
    assert response.status_code == 422


def test_answer_after_finish_returns_400(client, user_headers):
    session = create_interview(client, user_headers, question_count=3)
    question = session["questions"][0]
    submit_answer(client, user_headers, session["id"], question["id"])
    finish = client.post(f"/api/interviews/{session['id']}/finish", headers=user_headers)
    assert finish.status_code == 200
    response = client.post(
        f"/api/interviews/{session['id']}/answers",
        headers=user_headers,
        json={"question_id": question["id"], "text": "Поздний ответ."},
    )
    assert response.status_code == 400


def test_finish_without_answers_returns_400(client, user_headers):
    session = create_interview(client, user_headers, question_count=3)
    response = client.post(f"/api/interviews/{session['id']}/finish", headers=user_headers)
    assert response.status_code == 400


def test_finish_builds_report(client, user_headers):
    session = create_interview(client, user_headers, role="backend", level="middle", question_count=3)
    for question in session["questions"][:2]:
        submit_answer(client, user_headers, session["id"], question["id"])

    response = client.post(f"/api/interviews/{session['id']}/finish", headers=user_headers)
    assert response.status_code == 200
    finished = response.json()
    assert finished["status"] == "completed"
    assert finished["finished_at"]
    assert finished["overall_score"] is not None and 0 <= finished["overall_score"] <= 10
    assert finished["answered_count"] == 2
    assert len(finished["answers"]) == 2

    report = finished["report"]
    assert report is not None
    assert 0 <= report["overall_score"] <= 10
    assert report["overall_score"] == pytest.approx(finished["overall_score"])
    assert report["verdict"].strip()
    assert isinstance(report["recommendations"], list) and report["recommendations"]
    assert isinstance(report["topic_scores"], dict) and report["topic_scores"]
    assert report["answered_count"] == 2
    assert report["duration_sec"] >= 0
    for score in report["topic_scores"].values():
        assert 0 <= score <= 10

    again = client.post(f"/api/interviews/{session['id']}/finish", headers=user_headers)
    assert again.status_code == 200
    assert again.json()["overall_score"] == finished["overall_score"]


def test_adaptive_next_question(client, user_headers):
    session = create_interview(client, user_headers, question_count=3)
    existing_ids = {question["id"] for question in session["questions"]}
    response = client.post(f"/api/interviews/{session['id']}/questions/next", headers=user_headers)
    assert response.status_code == 201
    question = response.json()
    assert question["id"] not in existing_ids
    assert question["text"].strip()
    assert question["order_index"] == len(session["questions"])
    assert question["difficulty"] in {"easy", "medium", "hard"}
    assert question["type"] in {"theory", "code"}

    detail = client.get(f"/api/interviews/{session['id']}", headers=user_headers).json()
    assert len(detail["questions"]) == len(session["questions"]) + 1
    assert detail["question_count"] == len(detail["questions"])
    assert question["id"] in {item["id"] for item in detail["questions"]}


def test_list_interviews_with_pagination(client, user_headers):
    for _ in range(3):
        create_interview(client, user_headers, question_count=3)
    first_page = client.get("/api/interviews?limit=2&offset=0", headers=user_headers)
    assert first_page.status_code == 200
    payload = first_page.json()
    assert payload["total"] >= 3
    assert len(payload["items"]) == 2
    second_page = client.get("/api/interviews?limit=2&offset=2", headers=user_headers).json()
    assert second_page["total"] == payload["total"]
    assert len(second_page["items"]) == 1
    assert {item["id"] for item in payload["items"]} & {
        item["id"] for item in second_page["items"]
    } == set()


def test_delete_interview(client, user_headers):
    session = create_interview(client, user_headers, question_count=3)
    assert client.delete(f"/api/interviews/{session['id']}", headers=user_headers).status_code == 204
    assert client.get(f"/api/interviews/{session['id']}", headers=user_headers).status_code == 404


def test_interviews_are_isolated_between_users(client, user_headers, second_headers):
    session = create_interview(client, user_headers, question_count=3)

    assert client.get(f"/api/interviews/{session['id']}", headers=second_headers).status_code == 404
    assert (
        client.delete(f"/api/interviews/{session['id']}", headers=second_headers).status_code == 404
    )
    response = client.post(
        f"/api/interviews/{session['id']}/answers",
        headers=second_headers,
        json={"question_id": session["questions"][0]["id"], "text": "Чужой ответ."},
    )
    assert response.status_code == 404
    listed = client.get("/api/interviews", headers=second_headers).json()
    assert listed["total"] == 0

    # сессия первого пользователя не изменилась
    detail = client.get(f"/api/interviews/{session['id']}", headers=user_headers).json()
    assert detail["answered_count"] == 0


def test_unknown_interview_returns_404(client, user_headers):
    assert client.get("/api/interviews/999999", headers=user_headers).status_code == 404

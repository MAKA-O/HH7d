"""Тесты аналитики прогресса."""
from tests.conftest import create_interview, submit_answer


def _complete_session(client, headers, *, role="backend", level="junior", question_count=3) -> dict:
    session = create_interview(
        client, headers, role=role, level=level, mode="mixed", question_count=question_count
    )
    for question in session["questions"]:
        submit_answer(client, headers, session["id"], question["id"])
    response = client.post(f"/api/interviews/{session['id']}/finish", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def test_empty_analytics(client, user_headers):
    response = client.get("/api/analytics/overview", headers=user_headers)
    assert response.status_code == 200
    payload = response.json()
    assert payload["sessions_count"] == 0
    assert payload["completed_sessions"] == 0
    assert payload["avg_score"] == 0
    assert payload["best_score"] == 0
    assert payload["questions_answered"] == 0
    assert payload["streak_days"] == 0
    assert payload["weak_topics"] == []
    assert payload["strong_topics"] == []
    assert payload["topic_stats"] == []
    assert payload["difficulty_stats"] == {}
    assert payload["score_history"] == []
    assert payload["recent_sessions"] == []


def test_analytics_after_sessions(client, user_headers):
    first = _complete_session(client, user_headers, role="backend", level="junior", question_count=3)
    second = _complete_session(client, user_headers, role="qa", level="junior", question_count=3)

    response = client.get("/api/analytics/overview", headers=user_headers)
    assert response.status_code == 200
    payload = response.json()

    assert payload["sessions_count"] == 2
    assert payload["completed_sessions"] == 2
    expected_avg = round((first["overall_score"] + second["overall_score"]) / 2, 1)
    assert payload["avg_score"] == expected_avg
    assert payload["best_score"] == max(first["overall_score"], second["overall_score"])
    assert payload["questions_answered"] == 6
    assert isinstance(payload["streak_days"], int) and payload["streak_days"] >= 0

    assert len(payload["score_history"]) == 2
    history_scores = [point["score"] for point in payload["score_history"]]
    assert set(history_scores) == {first["overall_score"], second["overall_score"]}
    for point in payload["score_history"]:
        assert point["date"]

    assert payload["topic_stats"], "нет статистики по темам"
    for item in payload["topic_stats"]:
        assert item["topic"]
        assert item["answers_count"] >= 1
        assert 0 <= item["avg_score"] <= 10
    total_answers = sum(item["answers_count"] for item in payload["topic_stats"])
    assert total_answers == 6

    for item in payload["weak_topics"]:
        assert item["avg_score"] < 6.5
    for item in payload["strong_topics"]:
        assert item["avg_score"] >= 7.0

    assert set(payload["difficulty_stats"]) <= {"easy", "medium", "hard"}
    for score in payload["difficulty_stats"].values():
        assert 0 <= score <= 10

    assert len(payload["recent_sessions"]) == 2
    for session in payload["recent_sessions"]:
        assert session["status"] == "completed"
        assert session["answered_count"] == 3


def test_completed_and_in_progress_sessions_counted_separately(client, user_headers):
    _complete_session(client, user_headers, question_count=3)
    create_interview(client, user_headers, question_count=3)  # незавершённая

    payload = client.get("/api/analytics/overview", headers=user_headers).json()
    assert payload["sessions_count"] == 2
    assert payload["completed_sessions"] == 1
    assert len(payload["score_history"]) == 1
    assert len(payload["recent_sessions"]) == 2


def test_analytics_is_isolated_between_users(client, user_headers, second_headers):
    _complete_session(client, user_headers, question_count=3)
    payload = client.get("/api/analytics/overview", headers=second_headers).json()
    assert payload["sessions_count"] == 0
    assert payload["questions_answered"] == 0
    assert payload["recent_sessions"] == []

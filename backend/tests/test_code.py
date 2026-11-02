"""Тесты задач с кодом и ИИ-ревью (docs/API.md §5)."""
SEVERITIES = {"critical", "major", "minor", "nit"}
GOOD_CODE = (
    "def second_largest(nums):\n"
    "    unique = sorted(set(nums))\n"
    "    return unique[-2] if len(unique) > 1 else None\n"
)


def _create_task(client, headers, *, language="python", difficulty="medium", topic=None) -> dict:
    payload = {"language": language, "difficulty": difficulty}
    if topic is not None:
        payload["topic"] = topic
    response = client.post("/api/code/tasks", headers=headers, json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def test_create_code_task(client, user_headers):
    task = _create_task(client, user_headers, topic="Алгоритмы и структуры данных")
    assert task["id"]
    assert task["title"].strip()
    assert task["description"].strip()
    assert task["topic"] == "Алгоритмы и структуры данных"
    assert task["language"] == "python"
    assert task["difficulty"] == "medium"
    assert task["starter_code"].strip()
    assert isinstance(task["hints"], list)
    assert task["created_at"]


def test_create_code_task_uses_profile_topic(client, user_headers):
    client.put("/api/profile", headers=user_headers, json={"target_role": "data"})
    task = _create_task(client, user_headers, language="python", difficulty="easy")
    assert task["topic"].strip()
    assert task["language"] == "python"


def test_get_code_task(client, user_headers):
    task = _create_task(client, user_headers)
    response = client.get(f"/api/code/tasks/{task['id']}", headers=user_headers)
    assert response.status_code == 200
    assert response.json()["id"] == task["id"]
    assert client.get("/api/code/tasks/999999", headers=user_headers).status_code == 404


def test_review_code(client, user_headers):
    task = _create_task(client, user_headers)
    response = client.post(
        f"/api/code/tasks/{task['id']}/review",
        headers=user_headers,
        json={"code": GOOD_CODE},
    )
    assert response.status_code == 200, response.text
    review = response.json()
    assert review["id"]
    assert review["task_id"] == task["id"]
    assert 0 <= review["score"] <= 10
    assert review["verdict"].strip()
    assert isinstance(review["correctness_notes"], str)
    assert isinstance(review["issues"], list)
    for issue in review["issues"]:
        assert issue["severity"] in SEVERITIES
        assert issue["title"].strip()
    assert review["improved_code"].strip()
    assert review["time_complexity"] is None or isinstance(review["time_complexity"], str)
    assert review["space_complexity"] is None or isinstance(review["space_complexity"], str)


def test_review_history(client, user_headers):
    task = _create_task(client, user_headers)
    client.post(
        f"/api/code/tasks/{task['id']}/review", headers=user_headers, json={"code": GOOD_CODE}
    )
    response = client.get("/api/code/history", headers=user_headers)
    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] >= 1
    assert payload["items"][0]["task_id"] == task["id"]
    assert 0 <= payload["items"][0]["score"] <= 10


def test_review_unknown_task_returns_404(client, user_headers):
    response = client.post(
        "/api/code/tasks/999999/review", headers=user_headers, json={"code": GOOD_CODE}
    )
    assert response.status_code == 404


def test_review_requires_code(client, user_headers):
    task = _create_task(client, user_headers)
    response = client.post(
        f"/api/code/tasks/{task['id']}/review", headers=user_headers, json={"code": ""}
    )
    assert response.status_code == 422


def test_code_history_is_isolated_between_users(client, user_headers, second_headers):
    task = _create_task(client, user_headers)
    client.post(
        f"/api/code/tasks/{task['id']}/review", headers=user_headers, json={"code": GOOD_CODE}
    )
    payload = client.get("/api/code/history", headers=second_headers).json()
    assert payload["total"] == 0
    assert payload["items"] == []


def test_code_endpoints_require_auth(client):
    assert client.post("/api/code/tasks", json={}).status_code == 401
    assert client.get("/api/code/history").status_code == 401

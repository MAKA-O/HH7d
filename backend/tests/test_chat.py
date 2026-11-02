"""Тесты чат-ассистента (docs/API.md §4)."""


def _create_conversation(client, headers, title: str | None = None) -> dict:
    payload = {} if title is None else {"title": title}
    response = client.post("/api/chat/conversations", headers=headers, json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def test_create_conversation(client, user_headers):
    conversation = _create_conversation(client, user_headers, "Индексы в PostgreSQL")
    assert conversation["id"]
    assert conversation["title"] == "Индексы в PostgreSQL"
    assert conversation["message_count"] == 0
    assert conversation["created_at"]

    listed = client.get("/api/chat/conversations", headers=user_headers)
    assert listed.status_code == 200
    payload = listed.json()
    assert payload["total"] == 1
    assert payload["items"][0]["id"] == conversation["id"]


def test_create_conversation_without_title(client, user_headers):
    conversation = _create_conversation(client, user_headers)
    assert conversation["title"].strip()
    assert conversation["message_count"] == 0


def test_send_message_without_stream(client, user_headers):
    conversation = _create_conversation(client, user_headers, "Теория")
    response = client.post(
        f"/api/chat/conversations/{conversation['id']}/messages",
        headers=user_headers,
        json={"content": "Что такое индекс в базе данных?", "stream": False},
    )
    assert response.status_code == 200, response.text
    turn = response.json()
    assert turn["user_message"]["role"] == "user"
    assert turn["user_message"]["content"] == "Что такое индекс в базе данных?"
    assert turn["assistant_message"]["role"] == "assistant"
    assert turn["assistant_message"]["content"].strip()
    assert turn["assistant_message"]["id"] != turn["user_message"]["id"]

    messages = client.get(
        f"/api/chat/conversations/{conversation['id']}/messages", headers=user_headers
    ).json()["items"]
    assert len(messages) == 2
    assert messages[0]["role"] == "user"
    assert messages[1]["role"] == "assistant"

    listed = client.get("/api/chat/conversations", headers=user_headers).json()
    assert listed["items"][0]["message_count"] == 2


def test_send_message_with_stream(client, user_headers):
    conversation = _create_conversation(client, user_headers, "Поток")
    response = client.post(
        f"/api/chat/conversations/{conversation['id']}/messages",
        headers=user_headers,
        json={"content": "Объясни, что такое транзакция в БД.", "stream": True},
    )
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("text/event-stream")
    body = response.text
    assert "data:" in body
    assert "[DONE]" in body
    assert "delta" in body or "done" in body

    messages = client.get(
        f"/api/chat/conversations/{conversation['id']}/messages", headers=user_headers
    ).json()["items"]
    assert len(messages) == 2
    assert messages[0]["role"] == "user"
    assert messages[1]["role"] == "assistant"
    assert messages[1]["content"].strip()


def test_empty_message_returns_422(client, user_headers):
    conversation = _create_conversation(client, user_headers)
    response = client.post(
        f"/api/chat/conversations/{conversation['id']}/messages",
        headers=user_headers,
        json={"content": "", "stream": False},
    )
    assert response.status_code == 422


def test_unknown_conversation_returns_404(client, user_headers):
    response = client.get("/api/chat/conversations/999999/messages", headers=user_headers)
    assert response.status_code == 404
    response = client.post(
        "/api/chat/conversations/999999/messages",
        headers=user_headers,
        json={"content": "Привет", "stream": False},
    )
    assert response.status_code == 404


def test_conversations_are_isolated_between_users(client, user_headers, second_headers):
    conversation = _create_conversation(client, user_headers, "Личный диалог")

    assert client.get("/api/chat/conversations", headers=second_headers).json()["total"] == 0
    assert (
        client.get(
            f"/api/chat/conversations/{conversation['id']}/messages", headers=second_headers
        ).status_code
        == 404
    )
    assert (
        client.delete(f"/api/chat/conversations/{conversation['id']}", headers=second_headers).status_code
        == 404
    )


def test_delete_conversation(client, user_headers):
    conversation = _create_conversation(client, user_headers, "Удалить")
    assert (
        client.delete(
            f"/api/chat/conversations/{conversation['id']}", headers=user_headers
        ).status_code
        == 204
    )
    assert (
        client.get(f"/api/chat/conversations/{conversation['id']}/messages", headers=user_headers).status_code
        == 404
    )
    assert client.get("/api/chat/conversations", headers=user_headers).json()["total"] == 0


def test_chat_requires_auth(client):
    assert client.get("/api/chat/conversations").status_code == 401
    assert client.post("/api/chat/conversations", json={}).status_code == 401

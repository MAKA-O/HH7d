"""Тесты аутентификации: регистрация, логин, JWT, ошибки доступа."""
from tests.conftest import TEST_PASSWORD, auth_headers, register_user


def test_register_returns_token_and_user(client):
    response = client.post(
        "/api/auth/register",
        json={"email": "Student@Example.COM", "password": TEST_PASSWORD, "full_name": "  Иван  "},
    )
    assert response.status_code == 201
    payload = response.json()
    assert payload["token_type"] == "bearer"
    assert payload["access_token"]
    user = payload["user"]
    assert user["email"] == "student@example.com"  # нормализация email
    assert user["full_name"] == "Иван"
    assert user["target_role"] == "backend"
    assert user["target_level"] == "junior"
    assert isinstance(user["id"], int)
    assert user["created_at"]


def test_register_duplicate_email_returns_400(client):
    register_user(client, email="dup@example.com")
    response = client.post(
        "/api/auth/register",
        json={"email": "DUP@example.com", "password": TEST_PASSWORD, "full_name": "Другой"},
    )
    assert response.status_code == 400
    assert "detail" in response.json()


def test_register_invalid_email_returns_400(client):
    response = client.post(
        "/api/auth/register",
        json={"email": "not-an-email", "password": TEST_PASSWORD},
    )
    assert response.status_code == 400


def test_register_short_password_returns_422(client):
    response = client.post(
        "/api/auth/register",
        json={"email": "short@example.com", "password": "123"},
    )
    assert response.status_code == 422


def test_login_success(client):
    made = register_user(client, email="login@example.com", password="secret123")
    response = client.post(
        "/api/auth/login",
        json={"email": "LOGIN@example.com", "password": "secret123"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["access_token"]
    assert payload["user"]["id"] == made["user"]["id"]


def test_login_wrong_password_returns_401(client):
    register_user(client, email="wrong@example.com")
    response = client.post(
        "/api/auth/login",
        json={"email": "wrong@example.com", "password": "totally-wrong"},
    )
    assert response.status_code == 401


def test_login_unknown_email_returns_401(client):
    response = client.post(
        "/api/auth/login",
        json={"email": "ghost@example.com", "password": TEST_PASSWORD},
    )
    assert response.status_code == 401


def test_me_requires_token(client):
    response = client.get("/api/auth/me")
    assert response.status_code == 401


def test_me_with_invalid_token_returns_401(client):
    response = client.get("/api/auth/me", headers=auth_headers("not-a-jwt"))
    assert response.status_code == 401


def test_me_returns_current_user(client, user):
    response = client.get("/api/auth/me", headers=user["headers"])
    assert response.status_code == 200
    assert response.json()["email"] == user["email"]


def test_protected_endpoint_without_token_returns_401(client):
    assert client.get("/api/profile").status_code == 401
    assert client.get("/api/interviews").status_code == 401
    assert client.get("/api/analytics/overview").status_code == 401

"""Тесты справочников и профиля пользователя."""
from sqlalchemy import select

from app.models import User
from tests.conftest import auth_headers, register_user


def test_meta_returns_all_directories(client):
    response = client.get("/api/meta")
    assert response.status_code == 200
    payload = response.json()

    role_codes = [role["code"] for role in payload["roles"]]
    assert role_codes == ["backend", "frontend", "qa", "data", "devops", "general"]
    for role in payload["roles"]:
        assert role["title"] and role["description"]
        assert role["topics"], f"у роли {role['code']} нет тем"
        assert role["levels"] == ["intern", "junior", "middle", "senior"]

    assert [item["code"] for item in payload["levels"]] == [
        "intern",
        "junior",
        "middle",
        "senior",
    ]
    assert [item["code"] for item in payload["modes"]] == ["mixed", "theory", "code"]
    assert [item["code"] for item in payload["question_types"]] == ["theory", "code"]
    assert [item["code"] for item in payload["difficulties"]] == ["easy", "medium", "hard"]


def test_get_profile(client, user):
    response = client.get("/api/profile", headers=user["headers"])
    assert response.status_code == 200
    payload = response.json()
    assert payload["email"] == user["email"]
    assert payload["id"] == user["user"]["id"]


def test_update_profile(client, user):
    response = client.put(
        "/api/profile",
        headers=user["headers"],
        json={
            "full_name": "Новое Имя",
            "target_role": "frontend",
            "target_level": "middle",
            "resume_text": "Два года коммерческой разработки на React и TypeScript.",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["full_name"] == "Новое Имя"
    assert payload["target_role"] == "frontend"
    assert payload["target_level"] == "middle"

    me = client.get("/api/auth/me", headers=user["headers"]).json()
    assert me["target_role"] == "frontend"
    assert me["target_level"] == "middle"


def test_profile_partial_update_keeps_other_fields(client, user):
    client.put(
        "/api/profile",
        headers=user["headers"],
        json={"target_role": "qa", "target_level": "senior"},
    )
    response = client.put(
        "/api/profile", headers=user["headers"], json={"full_name": "Только имя"}
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["full_name"] == "Только имя"
    assert payload["target_role"] == "qa"
    assert payload["target_level"] == "senior"


def test_profile_invalid_role_returns_400(client, user):
    response = client.put(
        "/api/profile", headers=user["headers"], json={"target_role": "astronaut"}
    )
    assert response.status_code == 400


def test_profile_invalid_level_returns_422(client, user):
    response = client.put(
        "/api/profile", headers=user["headers"], json={"target_level": "godlike"}
    )
    assert response.status_code == 422


def test_profile_resume_text_is_stored(client, user, db_session):
    response = client.put(
        "/api/profile",
        headers=user["headers"],
        json={"resume_text": "Python, FastAPI, PostgreSQL, Docker."},
    )
    assert response.status_code == 200
    # UserOut по контракту не содержит резюме — проверяем сохранение в БД
    stored = db_session.scalar(select(User).where(User.id == user["user"]["id"]))
    assert stored is not None
    assert stored.resume_text == "Python, FastAPI, PostgreSQL, Docker."


def test_profiles_are_isolated(client, make_user):
    first = make_user("first@example.com", full_name="Первый")
    second = make_user("second@example.com", full_name="Второй")
    client.put(
        "/api/profile",
        headers=first["headers"],
        json={"target_role": "data", "target_level": "senior"},
    )
    second_profile = client.get("/api/profile", headers=second["headers"]).json()
    assert second_profile["target_role"] == "backend"
    assert second_profile["target_level"] == "junior"
    assert second_profile["full_name"] == "Второй"

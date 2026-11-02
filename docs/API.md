# API-контракт — «Интеллектуальный тренажёр для подготовки к собеседованиям»

Версия: **1.0**. Этот документ — единый источник истины для бэкенда и фронтенда.
Любое расхождение с кодом считается багом.

## Общие правила

* Базовый URL: `http://127.0.0.1:8000` (dev). Префикс всех методов: `/api`.
* Формат: JSON, `Content-Type: application/json`, кодировка UTF-8.
* Аутентификация: JWT, заголовок `Authorization: Bearer <token>`.
  Токен выдаётся `POST /api/auth/login` и `POST /api/auth/register`, живёт 7 дней.
* Ошибки: стандартный FastAPI-формат `{"detail": "сообщение"}`.
  Коды: `400` — неверный запрос, `401` — нет/просрочен токен, `403` — нет доступа,
  `404` — объект не найден, `422` — ошибка валидации, `503` — ИИ недоступен (и офлайн-режим тоже).
* Даты — ISO 8601 без таймзоны (UTC): `"2026-11-02T14:05:11"`.
* Идентификаторы — целые числа.
* Документация Swagger: `GET /api/docs`.

## Коды справочников

```
roles:  backend | frontend | qa | data | devops | general
levels: intern | junior | middle | senior
modes:  mixed | theory | code
question types: theory | code
difficulties: easy | medium | hard
session status: in_progress | completed
```

## Оценка ответа ИИ

`evaluation.criteria` — словарь из четырёх критериев, каждый `0..10`:

| Ключ | Смысл |
|---|---|
| `correctness` | фактическая правильность |
| `completeness` | полнота ответа |
| `depth` | глубина/понимание причин |
| `clarity` | структура и ясность изложения |

`evaluation.score` — интегральная оценка `0..10` (float, один знак после запятой).

---

## 1. Аутентификация

### `POST /api/auth/register`
```json
{"email": "student@example.com", "password": "secret123", "full_name": "Иван Петров"}
```
→ `201`
```json
{"access_token": "<jwt>", "token_type": "bearer",
 "user": {"id": 1, "email": "student@example.com", "full_name": "Иван Петров",
          "target_role": "backend", "target_level": "junior",
          "created_at": "2026-11-02T14:05:11"}}
```
`400` — email уже занят.

### `POST /api/auth/login`
```json
{"email": "student@example.com", "password": "secret123"}
```
→ `200` (тело как у register). `401` — неверная пара email/пароль.

### `GET /api/auth/me`
→ `200` `UserOut`.

## 2. Профиль и справочники

### `GET /api/meta`
→ `200`
```json
{"roles": [{"code": "backend", "title": "Backend-разработчик", "description": "...",
            "topics": ["Python", "SQL", "REST API"]}],
 "levels": [{"code": "junior", "title": "Junior"}],
 "modes": [{"code": "mixed", "title": "Смешанное собеседование"}],
 "question_types": [{"code": "theory", "title": "Теория"}],
 "difficulties": [{"code": "easy", "title": "Лёгкий"}]}
```

### `GET /api/profile` → `200` `UserOut`
### `PUT /api/profile`
```json
{"full_name": "Иван Петров", "target_role": "backend", "target_level": "middle",
 "resume_text": "3 года коммерческой разработки на Python..."}
```
→ `200` `UserOut`. Все поля необязательны.

## 3. Собеседования

### `POST /api/interviews` → `201` `SessionDetail`
```json
{"role": "backend", "level": "middle", "mode": "mixed",
 "question_count": 5, "focus_topics": ["Python", "SQL"]}
```
Создаёт сессию и сразу генерирует вопросы (ИИ или офлайн-банк).

### `GET /api/interviews?limit=20&offset=0` → `200` `{"items": [SessionSummary], "total": 12}`
### `GET /api/interviews/{id}` → `200` `SessionDetail` (`404` — чужая/несуществующая)
### `DELETE /api/interviews/{id}` → `204`

### `POST /api/interviews/{id}/answers` → `200` `AnswerResult`
```json
{"question_id": 7, "text": "Индекс — это структура данных...", "time_spent_sec": 95}
```
Повторная отправка на тот же вопрос перезаписывает ответ и пересчитывает оценку.
`400` — сессия завершена, вопрос из другой сессии, пустой ответ.

### `POST /api/interviews/{id}/finish` → `200` `SessionDetail`
Считает итоговый отчёт ИИ, переводит сессию в `completed`.
`400` — нет ни одного отвеченного вопроса.

### `POST /api/interviews/{id}/questions/next` → `201` `QuestionOut`
Адаптивный доп. вопрос (учитывает слабые места). Увеличивает `questions_count`.

## 4. Чат-ассистент по теории

### `GET /api/chat/conversations` → `200` `{"items": [ConversationOut], "total": 3}`
### `POST /api/chat/conversations`
```json
{"title": "Индексы в PostgreSQL"}   // title необязателен
```
→ `201` `ConversationOut`
### `GET /api/chat/conversations/{id}/messages` → `200` `{"items": [ChatMessageOut]}`

### `POST /api/chat/conversations/{id}/messages`
```json
{"content": "Что такое индекс в БД и когда он вредит?", "stream": false}
```
→ `200` `ChatTurnOut` `{"user_message": ChatMessageOut, "assistant_message": ChatMessageOut}`

Если `"stream": true`, ответ — `text/event-stream`, события:
```
data: {"delta": "Индекс — это "}

data: {"delta": "структура данных..."}

data: {"done": true, "message_id": 42}

data: [DONE]
```
Фронтенд склеивает `delta`. При ошибке — событие `data: {"error": "..."}` и закрытие.

### `DELETE /api/chat/conversations/{id}` → `204`

## 5. Задачи с кодом и ИИ-ревью

### `POST /api/code/tasks` → `201` `CodeTaskOut`
```json
{"topic": "Алгоритмы и структуры данных", "language": "python", "difficulty": "medium"}
```
`topic` необязателен (берётся из цели профиля).

### `GET /api/code/tasks/{id}` → `200` `CodeTaskOut`
### `GET /api/code/history` → `200` `{"items": [CodeReviewOut], "total": 4}`

### `POST /api/code/tasks/{id}/review` → `200` `CodeReviewOut`
```json
{"code": "def two_sum(nums, target):\n    ..."}
```
ИИ разбирает решение (без запуска кода!): оценка, список замечаний, улучшенный вариант, сложность.

`CodeReviewOut.issues` — `[{"severity": "major", "title": "Нет проверки пустого массива", "detail": "..."}]`,
`severity`: `critical | major | minor | nit`.

## 6. Аналитика

### `GET /api/analytics/overview` → `200`
```json
{"sessions_count": 8, "completed_sessions": 6, "avg_score": 6.4, "best_score": 8.7,
 "questions_answered": 41, "streak_days": 3,
 "weak_topics": [{"topic": "SQL", "avg_score": 4.2, "answers_count": 9}],
 "strong_topics": [{"topic": "Python", "avg_score": 8.1, "answers_count": 12}],
 "topic_stats": [{"topic": "Python", "avg_score": 8.1, "answers_count": 12}],
 "difficulty_stats": {"easy": 7.2, "medium": 5.8, "hard": 3.9},
 "score_history": [{"date": "2026-10-30", "score": 5.5}],
 "recent_sessions": [SessionSummary]}
```

## 7. ИИ: состояние и голос

### `GET /api/ai/health` → `200`
```json
{"provider": "openai", "model": "gpt-4o-mini", "mode": "live",
 "available": true, "message": "Модель отвечает"}
```
`mode`: `live` — подключена реальная модель, `offline` — локальный офлайн-движок (демо).

### `POST /api/voice/transcribe` — `multipart/form-data`, поле `file` (webm/wav/mp3)
→ `200` `{"text": "распознанный текст"}`; `503` — серверное распознавание недоступно
(тогда фронтенд использует встроенный Web Speech API браузера).

---

## Схемы (кратко)

```
UserOut:        id, email, full_name, target_role, target_level, created_at
ProfileIn:      full_name?, target_role?, target_level?, resume_text?
SessionSummary: id, role, level, mode, status, overall_score, questions_count,
                answered_count, started_at, finished_at, duration_sec
SessionDetail:  SessionSummary + questions[QuestionOut] + answers[AnswerResult] + report?
QuestionOut:    id, order_index, type, topic, difficulty, text, starter_code?, language?
AnswerOut:      id, question_id, text, time_spent_sec, created_at
EvaluationOut:  id, answer_id, question_id, score, criteria{}, strengths[], gaps[],
                ideal_answer, recommendation, follow_up_question?, created_at
AnswerResult:   answer AnswerOut + evaluation EvaluationOut
SessionReport:  overall_score, verdict, strengths[], gaps[], recommendations[],
                topic_scores{}, answered_count, duration_sec
ConversationOut: id, title, created_at, updated_at, message_count
ChatMessageOut:  id, role ("user"|"assistant"), content, created_at
CodeTaskOut:     id, title, description, topic, language, difficulty, starter_code,
                 hints[], created_at
CodeReviewOut:   id, task_id, score, verdict, correctness_notes, issues[], improved_code,
                 time_complexity?, space_complexity?, created_at
AnalyticsOut:    sessions_count, completed_sessions, avg_score, best_score,
                 questions_answered, streak_days, weak_topics[], strong_topics[],
                 topic_stats[], difficulty_stats{}, score_history[], recent_sessions[]
```

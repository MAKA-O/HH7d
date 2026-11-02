# Инструкция для команды разработки (внутренний документ)

Проект: **Интеллектуальный тренажёр для подготовки к собеседованиям**.
Корень репозитория: `C:\Users\MILLER\Downloads\HH7d`.

## Структура

```
backend/
  app/
    main.py, config.py, db.py, models.py, schemas.py, security.py, deps.py
    routers/     — API-эндпоинты (auth, users, meta, interviews, analytics, chat, code, ai_health, voice)
    ai/          — base.py (контракт), service.py (фабрика+fallback), live.py, offline.py, prompts.py, providers.py
    data/        — catalog.py (справочники), question_bank.py (банк вопросов)
  data/          — SQLite-файл (создаётся автоматически)
  tests/         — pytest
  requirements.txt, .env.example
frontend/        — React + TypeScript + Vite + Tailwind (собирается в backend/app/static)
docs/            — API.md (контракт!), остальная документация
tools/pyfix/     — обход ограничения песочницы (см. ниже)
scripts/         — запуск и сборка
```

## КРИТИЧНО: особенности окружения (Windows + песочница)

1. Python-интерпретатор: `C:\Users\MILLER\Downloads\HH7d\.venv\Scripts\python.exe`
   (Python 3.12, зависимости уже установлены).
2. **Всегда** задавайте `$env:PYTHONPATH = "C:\Users\MILLER\Downloads\HH7d\tools\pyfix"` перед запуском
   Python-команд. Иначе `os.mkdir(..., 0o700)` создаёт каталоги с недоступным ACL и любые
   инструменты (pip, pytest tmp) падают с PermissionError.
3. Установка Python-пакетов (если реально нужно):
   ```powershell
   $ws = "C:\Users\MILLER\Downloads\HH7d"
   $env:PYTHONPATH = "$ws\tools\pyfix"; $env:TMP = "$ws\.tmp"; $env:TEMP = "$ws\.tmp"; $env:PIP_CACHE_DIR = "$ws\.pip-cache"
   & "$ws\.venv\Scripts\python.exe" -m pip install <пакет>
   ```
4. npm (если нужно ставить пакеты):
   ```powershell
   $ws = "C:\Users\MILLER\Downloads\HH7d"
   $env:npm_config_cache = "$ws\.npm-cache"; $env:npm_config_tmp = "$ws\.npm-tmp"; $env:TMP = "$ws\.tmp"; $env:TEMP = "$ws\.tmp"
   Set-Location "$ws\frontend"; npm install
   ```
5. `curl.exe` и `Invoke-WebRequest` в песочнице не умеют TLS — для сетевых проверок используйте
   Python `httpx`/`urllib`.
6. Запись разрешена только внутри `C:\Users\MILLER\Downloads\HH7d`.
7. Не оставляйте запущенные процессы: проверяйте сервер в фоне и завершайте его.

## Запуск бэкенда

```powershell
$ws = "C:\Users\MILLER\Downloads\HH7d"
$env:PYTHONPATH = "$ws\tools\pyfix"
Set-Location "$ws\backend"
& "$ws\.venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Проверка: `GET http://127.0.0.1:8000/api/health`, Swagger — `/api/docs`.

## Запуск тестов

```powershell
$ws = "C:\Users\MILLER\Downloads\HH7d"
$env:PYTHONPATH = "$ws\tools\pyfix"
Set-Location "$ws\backend"
& "$ws\.venv\Scripts\python.exe" -m pytest -q
```

## Сборка фронтенда

`frontend/vite.config.ts` настроен так, что `npm run build` кладёт результат в
`backend/app/static` — после сборки всё приложение раздаётся одним uvicorn'ом.

## Правила работы

* **Не трогайте файлы вне своей зоны ответственности** (см. задачи на доске).
* Контракт API — `docs/API.md`. Если нужен новый эндпоинт/поле — сначала сообщите Lead'у,
  не меняйте контракт в одиночку.
* Код: Pydantic v2, SQLAlchemy 2.0 (`Mapped`, `mapped_column`), Python 3.12, тип-хинты,
  docstrings на русском, пользовательские тексты и сообщения об ошибках — на русском.
* Ошибки API: `HTTPException(status_code=..., detail="текст на русском")`.
* Никаких `print` в продакшн-коде — только `logging`.
* Не выполняйте `git commit`/`git push` — интеграцию и коммиты делает Lead.
* По завершении отправьте Lead'у короткий отчёт: что сделано, какие файлы, как проверено,
  известные ограничения.

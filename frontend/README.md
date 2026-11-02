# Frontend — тренажёр для подготовки к собеседованиям

SPA на React 18 + TypeScript + Vite + TailwindCSS, работает с API из `docs/API.md`.
Интерфейс полностью на русском языке, светлая тема по умолчанию (тёмная — переключателем),
mobile-first адаптивность. Дизайн-система описана в `docs/06-Дизайн-система.md`.

## Стек

| Слой | Технология |
|---|---|
| UI | React 18, TypeScript 5.6 |
| Сборка | Vite 8 (Rolldown/Oxc), `tsc --noEmit` перед сборкой |
| Стили | TailwindCSS 3.4 + PostCSS/Autoprefixer, токены через CSS-переменные |
| Роутинг | react-router-dom 6 |
| Графики | recharts |
| Иконки | lucide-react (stroke 1.75) |
| Голос | Web Speech API (ru-RU), fallback с сообщением |

## Быстрый старт

```powershell
# из корня репозитория
cd frontend
npm install
npm run dev      # http://localhost:5173, прокси /api → http://127.0.0.1:8000
```

Бэкенд для dev-режима:

```powershell
cd ../backend
..\.venv\Scripts\Activate.ps1   # или полный путь к python
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

## Сборка

```powershell
cd frontend
npm run build
```

Результат кладётся в `../backend/app/static` (`build.outDir`, `emptyOutDir: true`),
после чего всё приложение раздаётся одним uvicorn'ом: `GET /` → SPA, `GET /api/*` → API.

Другие команды:

```powershell
npm run typecheck   # только проверка типов
npm run preview     # локальный предпросмотр собранного бандла
```

## Дизайн-язык

* Светлая тема по умолчанию, тёмная — переключателем в сайдбаре и меню пользователя
  (`light` / `dark` / `system`, выбор в `localStorage["iq-theme"]`).
* Нейтральная палитра slate/white, один акцент `#2563eb`, семантические
  success/warning/danger. Без градиентных фонов, blur/glassmorphism и свечения.
* Типографика Inter/system-ui, шкала 12/13/14/16/20/24/30, body 14px.
* Плотность как в Stripe Dashboard: контейнер 1200px, строки таблиц 44px, контролы 40px,
  радиусы 8px (карточки) / 6px (кнопки и поля), тень `0 1px 2px rgba(15,23,42,.06)`.
* Каркас: сайдбар 240px (планшет — 64px, мобильный — drawer), топбар 56px с хлебными крошками,
  глобальным поиском, уведомлениями и меню пользователя.
* Состояния: skeleton/пусто/ошибка/disabled для всех данных; focus-visible 2px accent + offset 2px;
  цели нажатия ≥40×40px; контраст AA.

## Структура

```
src/
  main.tsx                — точка входа
  App.tsx                 — провайдеры (тема, авторизация, тосты) и маршруты
  index.css               — Tailwind, CSS-переменные тем, .card/.control/.table-head
  lib/
    api.ts                — единый API-клиент (JWT, 401, detail, SSE-стрим)
    types.ts              — типы всех схем из docs/API.md
    labels.ts             — русские подписи кодов и семантические классы бейджей
    format.ts             — даты, длительности, баллы, плюрализация
    cn.ts                 — склейка классов
  context/
    ThemeContext.tsx      — light/dark/system + localStorage
    AiStatusContext.tsx   — /api/ai/health + измеренная задержка
    AuthContext.tsx       — авторизация, токен в localStorage, useAuth
    ToastContext.tsx      — глобальные тосты ошибок/успехов
  hooks/
    useSpeechRecognition.ts — Web Speech API (ru-RU) + аккуратный fallback
  components/
    Layout.tsx            — сайдбар 240/64px, топбар, крошки, мобильный drawer
    GlobalSearch.tsx      — автокомплит по сессиям и диалогам (↑↓/Enter/Esc, ⌘K)
    NotificationsMenu.tsx — статус ИИ, завершённые сессии, «прочитать все»
    UserMenu.tsx          — профиль, тема, выход
    TopicCombobox.tsx     — chips фокус-тем с автодополнением
    SessionTable.tsx      — таблица сессий (desktop) / карточки (mobile)
    EvaluationPanel.tsx   — ИИ-оценка ответа (4 критерия, strengths/gaps, эталон)
    CodeEditor.tsx        — редактор кода с нумерацией строк
    AuthLayout.tsx, Brand.tsx, PageHeader.tsx, StatCard.tsx, ThemeToggle.tsx,
    AiStatusIndicator.tsx, ProtectedRoute.tsx
    ui/                   — Button/IconButton, Card, Field, Badge, Tabs, Segmented, Checkbox,
                            RangeSlider, Popover, Breadcrumbs, Modal, Skeleton, EmptyState,
                            ProgressBar, ScoreRing, RichText
  pages/                  — 11 экранов (см. ниже)
```

## Маршруты

| Путь | Экран |
|---|---|
| `/login`, `/register` | вход / регистрация (гостевые, авторизованного редиректят на `/`) |
| `/` | дашборд: KPI, график с периодом, темы, табы «Обзор/Сессии/Темы» |
| `/interview/new` | создание собеседования (направление, уровень, режим, вопросы, фокус-темы) |
| `/interview/:id` | прохождение: таймер, микрофон, ИИ-оценка, доп. вопрос, sticky CTA |
| `/interview/:id/report` | отчёт по сессии |
| `/chat` | чат по теории со стримингом |
| `/code` | задачи с кодом и ИИ-ревью, табы «Задача/История ревью» |
| `/history` | история сессий: поиск, фильтры, таблица, «показать ещё» |
| `/profile` | профиль и состояние ИИ (live/offline) |

## Особенности сборки в песочнице Windows

Окружение разработки (см. `docs/DEV_SETUP.md`) запрещает запуск дочерних процессов
с pipe-каналами: `spawn`/`exec` с перехватом вывода падает с `EPERM`. Из-за этого:

* `npm install` нужно запускать с `--ignore-scripts` (lifecycle-скрипты пакетов тоже
  используют спавн и падают; для этого проекта они не нужны);
* сборщик — **Vite 8**, где трансформация и бандлинг выполняются Rolldown/Oxc (нативные
  napi-аддоны в процессе Node, без дочерних процессов). Vite 5/6/7 требуют esbuild,
  который запускает бинарник через `spawn` с pipe — в песочнице это работать не будет;
* Vite на Windows один раз вызывает `exec("net use")` для определения сетевых дисков.
  `scripts/sandbox-spawn-workaround.cjs` подменяет только этот вызов, скрипты `dev`/`build`
  подключают его через `node --require`. На обычной машине поведение не меняется.

Команды установки из документации проекта:

```powershell
$ws = "C:\Users\MILLER\Downloads\HH7d"
$env:npm_config_cache = "$ws\.npm-cache"; $env:npm_config_tmp = "$ws\.npm-tmp"
$env:TMP = "$ws\.tmp"; $env:TEMP = "$ws\.tmp"
Set-Location "$ws\frontend"
npm install --ignore-scripts --no-audit --no-fund
```

## Работа с API

* Базовый URL — `/api` (относительный): в dev его проксирует Vite, в prod раздаёт FastAPI.
* JWT хранится в `localStorage` (`interview_trainer_token`) и подставляется в `Authorization`.
* Любой `401` сбрасывает токен и разлогинивает (`AuthContext`).
* Тексты ошибок берутся из `detail` FastAPI (включая список ошибок валидации 422).
* Чат: `POST /api/chat/conversations/{id}/messages` с `stream: true` читается через
  `fetch` + `ReadableStream`; дельты склеиваются, поддержаны `done`, `[DONE]` и `error`.
* Состояние ИИ запрашивается один раз на приложение (`AiStatusContext`) с кешем 60 секунд;
  задержка измеряется на клиенте вокруг запроса `/api/ai/health`.

## Известные ограничения

* **Голосовой ввод** работает только в браузерах с Web Speech API (Chrome/Edge).
  В остальных кнопка неактивна и показывается пояснение; серверное распознавание
  (`POST /api/voice/transcribe`) в UI не используется, т.к. контракт предполагает
  именно встроенный Web Speech API.
* `GET /api/profile` возвращает `UserOut` с полем `resume_text` (добавлено в контракт),
  поэтому сохранённое резюме подгружается в форму профиля полностью.
* SSE-парсер рассчитан на формат контракта: события `data: {...}` с `delta`/`done`/`error`,
  терминатор `data: [DONE]`.
* Браузерная визуальная проверка в песочнице недоступна (Playwright/любой spawn с pipe
  блокируется), поэтому вёрстка проверялась сборкой, типами и контрактным смоук-тестом API.

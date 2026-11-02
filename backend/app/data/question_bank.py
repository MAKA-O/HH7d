"""Встроенный банк вопросов и задач.

Используется:
* офлайн-движком ИИ (когда нет ключа API);
* как страховка, если LLM вернул некорректный ответ;
* для мгновенной генерации собеседования без задержек.
Банк не требует базы данных — это обычные Python-структуры.
"""
from collections import Counter
from typing import Any

DIFFICULTY_ORDER = {"easy": 0, "medium": 1, "hard": 2}
LEVEL_TARGET = {"intern": "easy", "junior": "easy", "middle": "medium", "senior": "hard"}

BANK: list[dict[str, Any]] = [
    # ------------------------------------------------------------------ backend
    {
        "role": "backend",
        "topic": "Python",
        "difficulty": "easy",
        "type": "theory",
        "text": "Чем список (list) отличается от кортежа (tuple) в Python?",
        "expected_points": [
            "list изменяемый, tuple неизменяемый",
            "tuple может быть ключом словаря / элементом множества (хешируемость)",
            "tuple обычно легче по памяти",
            "tuple защищает данные от случайного изменения",
        ],
    },
    {
        "role": "backend",
        "topic": "Python",
        "difficulty": "medium",
        "type": "theory",
        "text": "Что такое GIL в Python и как он влияет на многопоточность?",
        "expected_points": [
            "GIL — глобальная блокировка интерпретатора CPython",
            "одновременно байткод выполняет только один поток",
            "потоки полезны для ввода-вывода, не для CPU-задач",
            "для CPU-задач — multiprocessing или C-расширения",
        ],
    },
    {
        "role": "backend",
        "topic": "Python",
        "difficulty": "hard",
        "type": "theory",
        "text": "Как работают генераторы и чем они выгодны? Объясните ленивые вычисления.",
        "expected_points": [
            "генератор возвращает значения по одному через yield",
            "состояние функции сохраняется между вызовами",
            "экономия памяти на больших последовательностях",
            "пример: чтение большого файла построчно",
        ],
    },
    {
        "role": "backend",
        "topic": "ООП",
        "difficulty": "easy",
        "type": "theory",
        "text": "В чём разница между наследованием и композицией? Когда что выбирать?",
        "expected_points": [
            "наследование — отношение «является», композиция — «содержит»",
            "композиция гибче, меньше связанность",
            "наследование оправдано при общем контракте/поведении",
            "предпочтение композиции — принцип «предпочитайте композицию наследованию»",
        ],
    },
    {
        "role": "backend",
        "topic": "ООП",
        "difficulty": "medium",
        "type": "theory",
        "text": "Что такое SOLID? Приведите пример нарушения принципа единственной ответственности.",
        "expected_points": [
            "S — единственная ответственность, O — открытость/закрытость",
            "L — подстановка Лисков, I — разделение интерфейсов, D — инверсия зависимостей",
            "пример класса, который и считает, и сохраняет, и логирует",
            "вывод: разделение на слои/сервисы",
        ],
    },
    {
        "role": "backend",
        "topic": "Базы данных и SQL",
        "difficulty": "easy",
        "type": "theory",
        "text": "Что такое индекс в базе данных? Когда он ускоряет запросы, а когда вредит?",
        "expected_points": [
            "индекс — дополнительная структура (обычно B-tree) для ускорения поиска",
            "ускоряет WHERE/JOIN/ORDER BY по индексированным полям",
            "замедляет вставку/обновление/удаление и занимает место",
            "селективность: индексировать стоит колонки с высокой кардинальностью",
        ],
    },
    {
        "role": "backend",
        "topic": "Базы данных и SQL",
        "difficulty": "medium",
        "type": "theory",
        "text": "Объясните уровни изоляции транзакций и какие аномалии они предотвращают.",
        "expected_points": [
            "Read Uncommitted, Read Committed, Repeatable Read, Serializable",
            "грязное чтение, неповторяющееся чтение, фантомы",
            "PostgreSQL по умолчанию — Read Committed",
            "цена: конкурентность против консистентности",
        ],
    },
    {
        "role": "backend",
        "topic": "Базы данных и SQL",
        "difficulty": "hard",
        "type": "theory",
        "text": "Запрос с JOIN выполняется 10 секунд на большой таблице. Как вы будете искать узкое место?",
        "expected_points": [
            "EXPLAIN / EXPLAIN ANALYZE, чтение плана",
            "проверить индексы и их использование (Seq Scan)",
            "статистика, актуальность ANALYZE",
            "уменьшить объём: фильтры до JOIN, пагинация, кэш",
            "рассмотреть денормализацию/материализованное представление",
        ],
    },
    {
        "role": "backend",
        "topic": "REST API",
        "difficulty": "easy",
        "type": "theory",
        "text": "Какие HTTP-методы обычно используются в REST и чем PUT отличается от PATCH?",
        "expected_points": [
            "GET, POST, PUT, PATCH, DELETE",
            "PUT заменяет ресурс целиком, PATCH — частично",
            "идемпотентность PUT и DELETE",
            "коды ответов 200/201/204",
        ],
    },
    {
        "role": "backend",
        "topic": "REST API",
        "difficulty": "medium",
        "type": "theory",
        "text": "Как бы вы организовали аутентификацию и авторизацию в REST API?",
        "expected_points": [
            "аутентификация: сессии или JWT/токены",
            "JWT: подпись, срок жизни, refresh-токены",
            "авторизация: роли/права, проверка на каждом эндпоинте",
            "пароли — только хеши (bcrypt/argon2/pbkdf2) с солью",
        ],
    },
    {
        "role": "backend",
        "topic": "Сети и HTTP",
        "difficulty": "medium",
        "type": "theory",
        "text": "Что происходит от ввода URL в браузере до отображения страницы?",
        "expected_points": [
            "DNS-резолвинг, TCP/TLS-соединение",
            "HTTP-запрос и ответ, статусы",
            "парсинг HTML, построение DOM, запросы ресурсов",
            "рендеринг, JS-исполнение",
        ],
    },
    {
        "role": "backend",
        "topic": "Алгоритмы и структуры данных",
        "difficulty": "easy",
        "type": "theory",
        "text": "Какие структуры данных вы знаете и какие операции у них быстрые?",
        "expected_points": [
            "массив — доступ по индексу O(1), вставка в середину O(n)",
            "хеш-таблица — поиск в среднем O(1)",
            "связный список, стек, очередь, дерево/куча",
            "выбор структуры под задачу",
        ],
    },
    {
        "role": "backend",
        "topic": "Алгоритмы и структуры данных",
        "difficulty": "medium",
        "type": "theory",
        "text": "Как оценить сложность алгоритма? Приведите пример O(n log n) и O(n²).",
        "expected_points": [
            "Big O — верхняя граница роста",
            "сортировка слиянием/быстрая в среднем — O(n log n)",
            "вложенные циклы — O(n²)",
            "на практике учитывают константы и объём данных",
        ],
    },
    {
        "role": "backend",
        "topic": "Тестирование",
        "difficulty": "easy",
        "type": "theory",
        "text": "Что такое юнит-тесты и чем они отличаются от интеграционных?",
        "expected_points": [
            "юнит — изолированная маленькая единица кода",
            "интеграционные — взаимодействие компонентов (БД, API)",
            "скорость и стабильность юнит-тестов",
            "пирамида тестирования",
        ],
    },
    {
        "role": "backend",
        "topic": "Docker и CI/CD",
        "difficulty": "medium",
        "type": "theory",
        "text": "Зачем нужен Docker и чем образ отличается от контейнера?",
        "expected_points": [
            "образ — неизменяемый шаблон, контейнер — запущенный экземпляр",
            "изоляция зависимостей и воспроизводимость окружения",
            "слои образа и кэширование",
            "Dockerfile: инструкции сборки",
        ],
    },
    # ------------------------------------------------------------------ frontend
    {
        "role": "frontend",
        "topic": "JavaScript",
        "difficulty": "easy",
        "type": "theory",
        "text": "Чем let отличается от const и var?",
        "expected_points": [
            "let/const — блочная область видимости, var — функциональная",
            "const запрещает переприсваивание, но не мутацию объекта",
            "временная мёртвая зона (hoisting у let/const)",
            "на практике использовать const по умолчанию, let при переприсваивании",
        ],
    },
    {
        "role": "frontend",
        "topic": "JavaScript",
        "difficulty": "medium",
        "type": "theory",
        "text": "Что такое замыкание (closure) и где оно применяется?",
        "expected_points": [
            "функция запоминает лексическое окружение",
            "доступ к переменным внешней функции после её завершения",
            "применение: счётчики, каррирование, приватное состояние",
            "частый источник утечек памяти при подписках",
        ],
    },
    {
        "role": "frontend",
        "topic": "JavaScript",
        "difficulty": "medium",
        "type": "theory",
        "text": "Что такое event loop в JavaScript? Объясните микрозадачи и макрозадачи.",
        "expected_points": [
            "однопоточная модель, асинхронность через очередь событий",
            "стек вызовов, очередь задач",
            "Promise.then — микрозадачи, setTimeout — макрозадачи",
            "микрозадачи выполняются раньше макрозадач",
        ],
    },
    {
        "role": "frontend",
        "topic": "React",
        "difficulty": "easy",
        "type": "theory",
        "text": "Что такое состояние (state) в React и чем оно отличается от пропсов?",
        "expected_points": [
            "пропсы передаются снаружи и неизменяемы",
            "state принадлежит компоненту и меняется через setState",
            "изменение state вызывает ререндер",
            "поднятие состояния при необходимости",
        ],
    },
    {
        "role": "frontend",
        "topic": "React",
        "difficulty": "medium",
        "type": "theory",
        "text": "Что такое хуки и какие правила их использования вы знаете?",
        "expected_points": [
            "useState, useEffect, useMemo, useCallback, useRef",
            "вызывать только на верхнем уровне компонента/кастомного хука",
            "useEffect: зависимости, очистка, избегание бесконечных циклов",
            "кастомные хуки для переиспользования логики",
        ],
    },
    {
        "role": "frontend",
        "topic": "React",
        "difficulty": "hard",
        "type": "theory",
        "text": "Как работает виртуальный DOM и почему ключи в списках важны?",
        "expected_points": [
            "виртуальный DOM — лёгкое представление UI в памяти",
            "diff-алгоритм и точечные обновления реального DOM",
            "ключи помогают сопоставить элементы при изменениях",
            "использовать стабильные ключи, не индекс массива при сортировке",
        ],
    },
    {
        "role": "frontend",
        "topic": "HTML и CSS",
        "difficulty": "easy",
        "type": "theory",
        "text": "Что такое блочная модель CSS и как посчитать ширину элемента?",
        "expected_points": [
            "content, padding, border, margin",
            "box-sizing: content-box и border-box",
            "margin collapse",
            "ширина = content + padding + border при content-box",
        ],
    },
    {
        "role": "frontend",
        "topic": "Браузер и DOM",
        "difficulty": "medium",
        "type": "theory",
        "text": "Что такое критический путь рендеринга и как его ускорить?",
        "expected_points": [
            "HTML → DOM, CSS → CSSOM, рендер-дерево",
            "блокирующие ресурсы: CSS, синхронные скрипты",
            "async/defer, минификация, прелоады",
            "избегать layout shift, оптимизировать шрифты и изображения",
        ],
    },
    {
        "role": "frontend",
        "topic": "TypeScript",
        "difficulty": "medium",
        "type": "theory",
        "text": "Чем интерфейс отличается от type в TypeScript и когда что использовать?",
        "expected_points": [
            "interface расширяется declaration merging, type — объединения/утилиты",
            "type удобен для union/intersection/mapped типов",
            "interface лучше для публичных контрактов",
            "оба стираются при компиляции",
        ],
    },
    # ------------------------------------------------------------------ qa
    {
        "role": "qa",
        "topic": "Теория тестирования",
        "difficulty": "easy",
        "type": "theory",
        "text": "Чем верификация отличается от валидации?",
        "expected_points": [
            "верификация — «правильно ли построили продукт» (по требованиям)",
            "валидация — «тот ли продукт нужен пользователю»",
            "примеры: ревью требований / приёмка пользователем",
        ],
    },
    {
        "role": "qa",
        "topic": "Тест-дизайн",
        "difficulty": "medium",
        "type": "theory",
        "text": "Как протестировать поле ввода возраста (от 18 до 65)? Какие техники примените?",
        "expected_points": [
            "классы эквивалентности: <18, 18–65, >65",
            "граничные значения: 17, 18, 65, 66",
            "нечисловые значения, пустое поле, очень большие числа",
            "техника попарного тестирования при нескольких полях",
        ],
    },
    {
        "role": "qa",
        "topic": "API-тестирование",
        "difficulty": "medium",
        "type": "theory",
        "text": "Как вы будете тестировать REST API? Что проверите в первую очередь?",
        "expected_points": [
            "валидные/невалидные входные данные",
            "коды ответов и схема тела",
            "авторизация и права доступа",
            "идемпотентность, граничные случаи, производительность",
        ],
    },
    {
        "role": "qa",
        "topic": "Автотесты",
        "difficulty": "medium",
        "type": "theory",
        "text": "Когда автотест не оправдан?",
        "expected_points": [
            "редко используемый функционал",
            "быстро меняющиеся требования/UI",
            "дорогая поддержка при низкой ценности",
            "нагрузочные/разовые проверки проще вручную",
        ],
    },
    {
        "role": "qa",
        "topic": "SQL для тестировщика",
        "difficulty": "easy",
        "type": "theory",
        "text": "Что вы проверите в базе после оформления заказа в интернет-магазине?",
        "expected_points": [
            "запись заказа и позиций, статусы",
            "связи между таблицами и отсутствие дублей",
            "баланс/списание и транзакционность",
            "консистентность данных после ошибок",
        ],
    },
    {
        "role": "qa",
        "topic": "Баг-репорты и процессы",
        "difficulty": "easy",
        "type": "theory",
        "text": "Что обязательно входит в хороший баг-репорт?",
        "expected_points": [
            "шаги воспроизведения",
            "фактический и ожидаемый результат",
            "окружение и версия",
            "критичность/приоритет, вложения (скриншоты, логи)",
        ],
    },
    # ------------------------------------------------------------------ data
    {
        "role": "data",
        "topic": "SQL и аналитика",
        "difficulty": "easy",
        "type": "theory",
        "text": "Чем INNER JOIN отличается от LEFT JOIN?",
        "expected_points": [
            "INNER — только совпадающие строки",
            "LEFT — все строки левой таблицы + совпадения",
            "NULL в правой таблице при отсутствии совпадения",
            "пример: клиенты без заказов",
        ],
    },
    {
        "role": "data",
        "topic": "SQL и аналитика",
        "difficulty": "medium",
        "type": "theory",
        "text": "Чем WHERE отличается от HAVING и зачем нужны оконные функции?",
        "expected_points": [
            "WHERE фильтрует строки до агрегации, HAVING — после",
            "оконные функции не сворачивают строки",
            "ROW_NUMBER, RANK, SUM() OVER (PARTITION BY ...)",
            "пример: доля выручки по городу",
        ],
    },
    {
        "role": "data",
        "topic": "Python для данных",
        "difficulty": "easy",
        "type": "theory",
        "text": "Как в pandas быстро посмотреть структуру и пропуски в таблице?",
        "expected_points": [
            "head(), info(), describe()",
            "isna().sum() для пропусков",
            "dtypes и приведение типов",
            "value_counts() для категорий",
        ],
    },
    {
        "role": "data",
        "topic": "Статистика",
        "difficulty": "medium",
        "type": "theory",
        "text": "Что такое p-value и как его не надо интерпретировать?",
        "expected_points": [
            "вероятность получить такие данные при истинной нулевой гипотезе",
            "это не вероятность, что гипотеза верна",
            "малый p-value ≠ большая практическая значимость",
            "проблема множественных сравнений",
        ],
    },
    {
        "role": "data",
        "topic": "Основы машинного обучения",
        "difficulty": "medium",
        "type": "theory",
        "text": "Что такое переобучение и как с ним бороться?",
        "expected_points": [
            "модель запомнила шум, плохо обобщает",
            "train/validation/test, кросс-валидация",
            "регуляризация, упрощение модели, больше данных",
            "early stopping для градиентного бустинга",
        ],
    },
    {
        "role": "data",
        "topic": "Визуализация данных",
        "difficulty": "easy",
        "type": "theory",
        "text": "Когда использовать столбчатую диаграмму, а когда линейный график?",
        "expected_points": [
            "столбцы — сравнение категорий",
            "линия — тренд во времени",
            "не искажать оси и не использовать 3D",
            "подписи, единицы измерения, источник",
        ],
    },
    # ------------------------------------------------------------------ devops
    {
        "role": "devops",
        "topic": "Linux",
        "difficulty": "easy",
        "type": "theory",
        "text": "Как найти процесс, который слушает порт 8080, и завершить его?",
        "expected_points": [
            "ss -ltnp / lsof -i :8080",
            "определить PID",
            "kill -15, при необходимости kill -9",
            "проверить, что порт освободился",
        ],
    },
    {
        "role": "devops",
        "topic": "Docker",
        "difficulty": "medium",
        "type": "theory",
        "text": "Чем отличается COPY от ADD в Dockerfile и почему важен порядок слоёв?",
        "expected_points": [
            "ADD умеет распаковывать архивы и качать по URL",
            "COPY предпочтительнее — предсказуемее",
            "кэш слоёв: сначала зависимости, потом код",
            "multi-stage сборка для маленьких образов",
        ],
    },
    {
        "role": "devops",
        "topic": "CI/CD",
        "difficulty": "medium",
        "type": "theory",
        "text": "Опишите типичный пайплайн CI/CD для веб-сервиса.",
        "expected_points": [
            "lint, тесты, сборка артефакта",
            "публикация образа в registry",
            "деплой на stage, смоук-тесты, прод",
            "откат, секреты, версионирование",
        ],
    },
    {
        "role": "devops",
        "topic": "Kubernetes",
        "difficulty": "hard",
        "type": "theory",
        "text": "Что такое Pod и чем Deployment отличается от StatefulSet?",
        "expected_points": [
            "Pod — минимальная единица запуска",
            "Deployment — stateless-приложения, реплики, rolling update",
            "StatefulSet — стабильные идентичность и хранилище",
            "Services, ConfigMap, Secret, probes",
        ],
    },
    {
        "role": "devops",
        "topic": "Мониторинг и логирование",
        "difficulty": "medium",
        "type": "theory",
        "text": "Как понять, что сервис деградировал, и какие метрики смотреть?",
        "expected_points": [
            "SLI/SLO, latency, error rate, throughput",
            "насыщение ресурсов (CPU, память, диск)",
            "логи и трассировка",
            "алерты по симптомам, а не по причинам",
        ],
    },
    # ------------------------------------------------------------------ general
    {
        "role": "general",
        "topic": "О себе",
        "difficulty": "easy",
        "type": "theory",
        "text": "Расскажите о себе: какой у вас опыт и что вы хотите развивать?",
        "expected_points": [
            "структура: настоящее → прошлое → будущее",
            "конкретные проекты и технологии",
            "связь опыта с позицией",
            "2–3 минуты, без пересказа резюме",
        ],
    },
    {
        "role": "general",
        "topic": "Мотивация",
        "difficulty": "easy",
        "type": "theory",
        "text": "Почему вы хотите работать именно в нашей компании?",
        "expected_points": [
            "знание продукта/технологий компании",
            "связь с личными целями",
            "конкретика, а не «мне нравится команда»",
            "вопросы о команде и задачах",
        ],
    },
    {
        "role": "general",
        "topic": "Командная работа",
        "difficulty": "medium",
        "type": "theory",
        "text": "Расскажите о конфликте в команде и как вы его решили (по методу STAR).",
        "expected_points": [
            "Situation/Task/Action/Result",
            "факты без эмоциональных оценок",
            "конкретные действия и результат",
            "вывод и что изменилось в процессе",
        ],
    },
    {
        "role": "general",
        "topic": "Карьерные цели",
        "difficulty": "medium",
        "type": "theory",
        "text": "Каким вы видите свой профессиональный рост через 2–3 года?",
        "expected_points": [
            "конкретные технические цели",
            "связь с текущей позицией",
            "реалистичность",
            "готовность брать ответственность",
        ],
    },
    {
        "role": "general",
        "topic": "Конфликты и обратная связь",
        "difficulty": "medium",
        "type": "theory",
        "text": "Как вы реагируете на критику вашего кода?",
        "expected_points": [
            "критика кода ≠ критика личности",
            "задавать уточняющие вопросы",
            "аргументированная позиция и принятие лучшего решения",
            "пример из практики",
        ],
    },
    # ------------------------------------------------------- задачи с кодом
    {
        "role": "backend",
        "topic": "Алгоритмы и структуры данных",
        "difficulty": "easy",
        "type": "code",
        "text": "Напишите функцию, которая возвращает второй по величине уникальный элемент списка. Если такого нет — None.",
        "starter_code": "def second_largest(nums: list[int]) -> int | None:\n    # ваш код\n    ...\n",
        "language": "python",
        "expected_points": [
            "учёт уникальности (set или сортировка)",
            "обработка пустого списка и списка из одного элемента",
            "сложность не хуже O(n log n), желательно O(n)",
            "возвращает None, если второго элемента нет",
        ],
    },
    {
        "role": "backend",
        "topic": "Алгоритмы и структуры данных",
        "difficulty": "medium",
        "type": "code",
        "text": "Напишите функцию, проверяющую, является ли строка палиндромом, без учёта регистра и неалфавитных символов.",
        "starter_code": "def is_palindrome(text: str) -> bool:\n    # ваш код\n    ...\n",
        "language": "python",
        "expected_points": [
            "нормализация: регистр, фильтрация символов",
            "два указателя или срез [::-1]",
            "O(n) по времени, O(n) или O(1) по памяти",
            "пустая строка считается палиндромом",
        ],
    },
    {
        "role": "backend",
        "topic": "Алгоритмы и структуры данных",
        "difficulty": "hard",
        "type": "code",
        "text": "Напишите функцию, которая находит длину самой длинной подстроки без повторяющихся символов.",
        "starter_code": "def longest_unique_substring(s: str) -> int:\n    # ваш код\n    ...\n",
        "language": "python",
        "expected_points": [
            "скользящее окно",
            "словарь символ → индекс",
            "сдвиг левой границы при повторе",
            "O(n) по времени",
        ],
    },
]

CODE_TASKS: list[dict[str, Any]] = [
    {
        "title": "Второй по величине элемент",
        "topic": "Алгоритмы и структуры данных",
        "language": "python",
        "difficulty": "easy",
        "description": "Дан список целых чисел. Верните второй по величине уникальный элемент или None, если его нет.\n\nПример: [3, 1, 4, 4, 2] → 3; [1] → None.",
        "starter_code": "def second_largest(nums: list[int]) -> int | None:\n    # ваш код\n    ...\n",
        "hints": [
            "Сначала избавьтесь от дублей.",
            "Проверьте крайние случаи: пустой список, один элемент.",
        ],
    },
    {
        "title": "Палиндром",
        "topic": "Алгоритмы и структуры данных",
        "language": "python",
        "difficulty": "easy",
        "description": "Проверьте, является ли строка палиндромом без учёта регистра и неалфавитных символов.\n\nПример: \"А роза упала на лапу Азора\" → True.",
        "starter_code": "def is_palindrome(text: str) -> bool:\n    # ваш код\n    ...\n",
        "hints": ["Оставьте только буквы и приведите к нижнему регистру.", "Можно сравнить строку с обратной."],
    },
    {
        "title": "Слияние отсортированных массивов",
        "topic": "Алгоритмы и структуры данных",
        "language": "python",
        "difficulty": "medium",
        "description": "Слейте два отсортированных массива в один отсортированный за O(n + m). Избегайте полной сортировки результата.",
        "starter_code": "def merge_sorted(a: list[int], b: list[int]) -> list[int]:\n    # ваш код\n    ...\n",
        "hints": ["Два указателя.", "Не забывайте про остатки массивов."],
    },
    {
        "title": "Агрегация заказов в SQL",
        "topic": "Базы данных и SQL",
        "language": "sql",
        "difficulty": "medium",
        "description": "Есть таблицы orders(id, user_id, amount, created_at) и users(id, city). Верните по каждому городу количество заказов и сумму, только за последние 30 дней, города без заказов тоже включите (0).",
        "starter_code": "-- ваш запрос\nSELECT ...\n",
        "hints": ["LEFT JOIN от users к orders.", "Фильтр по дате в ON, а не в WHERE."],
    },
    {
        "title": "Дедупликация с сохранением порядка",
        "topic": "Алгоритмы и структуры данных",
        "language": "python",
        "difficulty": "medium",
        "description": "Удалите дубликаты из списка, сохранив порядок первого появления. Верните новый список.",
        "starter_code": "def dedupe(items: list[int]) -> list[int]:\n    # ваш код\n    ...\n",
        "hints": ["Множество для проверки «уже видели».", "Сложность O(n)."],
    },
]


def all_questions() -> list[dict[str, Any]]:
    return [dict(item) for item in BANK]


def pick_questions(
    *,
    role: str,
    level: str,
    mode: str,
    count: int,
    focus_topics: list[str] | None = None,
    exclude: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Детерминированный подбор вопросов под роль, уровень и режим."""
    if count <= 0:
        return []
    excluded = {(text or "").strip().lower() for text in (exclude or [])}
    focus = [topic.strip().lower() for topic in (focus_topics or []) if topic.strip()]
    target = LEVEL_TARGET.get(level, "medium")
    target_rank = DIFFICULTY_ORDER.get(target, 1)

    pool = [
        item
        for item in BANK
        if item["role"] in (role, "general") and item["text"].strip().lower() not in excluded
    ]
    if mode == "theory":
        theory_pool = [item for item in pool if item["type"] == "theory"]
        pool = theory_pool or pool

    def rank(item: dict[str, Any]) -> tuple[int, int, int]:
        focus_rank = 0
        if focus:
            focus_rank = 0 if item["topic"].strip().lower() in focus else 1
        difficulty_rank = abs(DIFFICULTY_ORDER.get(item["difficulty"], 1) - target_rank)
        return (focus_rank, difficulty_rank, DIFFICULTY_ORDER.get(item["difficulty"], 1))

    ordered = sorted(pool, key=rank)
    selected: list[dict[str, Any]] = []
    topic_usage: Counter[str] = Counter()
    for item in ordered:
        if len(selected) >= count:
            break
        if mode != "theory" and topic_usage[item["topic"]] >= 2:
            continue
        if mode == "theory" and topic_usage[item["topic"]] >= 2:
            continue
        selected.append(item)
        topic_usage[item["topic"]] += 1
    for item in ordered:
        if len(selected) >= count:
            break
        if item not in selected:
            selected.append(item)

    if mode == "code" and not any(item["type"] == "code" for item in selected):
        code_item = next((item for item in ordered if item["type"] == "code"), None)
        if code_item is not None:
            if len(selected) >= count and selected:
                selected[-1] = code_item
            else:
                selected.append(code_item)

    return [dict(item) for item in selected[:count]]


def pick_code_task(
    *, topic: str | None = None, language: str = "python", difficulty: str = "medium"
) -> dict[str, Any]:
    candidates = [task for task in CODE_TASKS if task["difficulty"] == difficulty]
    if language:
        by_language = [task for task in candidates if task["language"] == language]
        candidates = by_language or candidates
    if topic:
        by_topic = [task for task in candidates if task["topic"] == topic]
        candidates = by_topic or candidates
    if not candidates:
        candidates = CODE_TASKS
    return dict(candidates[0])


def bank_size() -> int:
    return len(BANK)

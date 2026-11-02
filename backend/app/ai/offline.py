"""Офлайн-движок ИИ: полностью детерминированный демо-режим без сети.

Движок используется, когда ``AI_API_KEY`` не задан (``AI_PROVIDER=auto``) или
живой провайдер временно недоступен. Вся «интеллектуальность» построена на
эвристиках и встроенной базе знаний, поэтому поведение воспроизводимо:
одинаковый вход всегда даёт одинаковый выход.

Возможности:
* генерация вопросов из ``app.data.question_bank`` (``pick_questions``);
* эвристическая оценка ответа по четырём критериям, эталон и рекомендации;
* итоговый отчёт по сессии с вердиктом и средними баллами по темам;
* задачи с кодом и статическое код-ревью без выполнения кода;
* чат-ассистент по базе знаний из 15 тем с потоковой выдачей по предложениям.
"""
from __future__ import annotations

import re
from collections.abc import Iterator
from typing import Any

from app.ai.base import (
    AIHealthInfo,
    AIService,
    CodeIssueData,
    CodeReviewData,
    CodeTaskData,
    EvaluationResult,
    GeneratedQuestion,
    SessionReportData,
)
from app.data.catalog import LEVEL_DIFFICULTY, role_topics
from app.data.question_bank import pick_code_task, pick_questions

CRITERIA_KEYS = ("correctness", "completeness", "depth", "clarity")

DIFFICULTIES = {"easy", "medium", "hard"}
QUESTION_TYPES = {"theory", "code"}
SEVERITIES = {"critical", "major", "minor", "nit"}

LEVEL_ANSWER_FACTOR = {"intern": 0.8, "junior": 1.0, "middle": 1.15, "senior": 1.3}

# --------------------------------------------------------------- стоп-слова
_STOPWORDS = frozenset(
    """
    и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по
    только ее мне было вот от меня еще нет о из ему теперь когда даже ну вдруг ли если
    уже или ни быть был него до вас нибудь опять уж вам ведь там потом себя ничего ей
    может они тут где есть надо ней для мы тебя их чем была сам чтоб без будто чего раз
    тоже себе под будет ж тогда кто этот того потому этого какой совсем ним здесь этом
    один почти мой тем чтобы нее сейчас были куда зачем всех никогда можно при наконец
    два об другой хоть после над больше тот через эти нас про всего них какая много
    разве три эту моя впрочем хорошо свою этой перед иногда лучше чуть том нельзя такой
    им более всегда конечно всю между также кроме этого этих тебе вами нами вами оно
    свой своя свои своих наш наша наше наши ваш ваша ваше ваши
    the a an and or of to in for on is are was were be with as by it this that from at
    we you they i not can will do does did what when why how which their our your its
    also may should if then than so such use using used into about more most other some
    """.split()
)

_ENDINGS = (
    "иями", "ями", "ами", "ыми", "ими", "ах", "ях", "ам", "ям", "ов", "ев", "ий",
    "ый", "ой", "ей", "ая", "ое", "ые", "ом", "ем", "ть", "тся", "ться", "ing",
    "ed", "es", "s", "у", "ю", "а", "я", "ы", "и", "е", "о",
)


def _normalize(text: str) -> str:
    """Нижний регистр и единая буква «е» (ё → е)."""
    return (text or "").lower().replace("ё", "е")


def _stem(word: str) -> str:
    """Простейший стеммер: отрезает частые окончания у достаточно длинных слов."""
    value = _normalize(word)
    for ending in sorted(_ENDINGS, key=len, reverse=True):
        if len(value) - len(ending) >= 4 and value.endswith(ending):
            return value[: -len(ending)]
    return value


def _words(text: str) -> list[str]:
    """Все слова/токены текста (латиница, кириллица, цифры)."""
    return re.findall(r"[A-Za-zА-Яа-яЁё0-9_+#]+", text or "")


def _tokens(text: str) -> list[str]:
    """Значимые слова (без стоп-слов и слишком коротких)."""
    result: list[str] = []
    for word in _words(text):
        if len(word) < 3 or _normalize(word) in _STOPWORDS:
            continue
        result.append(_stem(word))
    return result


def _forms_match(left: str, right: str) -> bool:
    """Сравнивает две основы слова (общий префикс с учётом длины)."""
    if not left or not right:
        return False
    if left == right:
        return True
    shortest = min(len(left), len(right))
    if shortest < 4:
        return False
    width = 6 if shortest >= 6 else 4
    return left[:width] == right[:width]


def _point_keywords(point: str) -> list[str]:
    """Уникальные ключевые основы пункта эталонного ответа."""
    seen: list[str] = []
    for token in _tokens(point):
        if token not in seen:
            seen.append(token)
    return seen


def _coverage(point: str, answer_tokens: list[str]) -> float:
    """Доля ключевых слов пункта, найденных в ответе (0..1)."""
    keywords = _point_keywords(point)
    if not keywords:
        return 0.0
    hits = 0
    for keyword in keywords:
        if any(_forms_match(keyword, token) for token in answer_tokens):
            hits += 1
    return hits / len(keywords)


def _overlap(source_tokens: list[str], answer_tokens: list[str]) -> float:
    """Доля значимых слов источника, найденных в ответе."""
    unique = list(dict.fromkeys(source_tokens))
    if not unique:
        return 0.0
    hits = sum(1 for token in unique if any(_forms_match(token, item) for item in answer_tokens))
    return hits / len(unique)


def _clamp(value: Any, low: float = 0.0, high: float = 10.0) -> float:
    """Приводит значение к float в диапазоне и округляет до 0,1."""
    try:
        number = float(value)
    except (TypeError, ValueError):
        return low
    if number != number:  # NaN
        return low
    return round(max(low, min(high, number)), 1)


def _unique_strings(values: Any, *, limit: int = 6) -> list[str]:
    """Список непустых уникальных строк из произвольного значения."""
    result: list[str] = []
    source = values if isinstance(values, (list, tuple)) else [values]
    for item in source:
        text = str(item or "").strip()
        if text and text not in result:
            result.append(text)
        if len(result) >= limit:
            break
    return result


def _sentences(text: str) -> list[str]:
    """Разбивает текст на непустые предложения."""
    parts = re.split(r"(?<=[.!?…])\s+", (text or "").strip())
    return [part.strip() for part in parts if part.strip()]


# ============================================================ оценка ответа
_STRUCTURE_MARKERS = (
    "во-первых", "во вторых", "во-вторых", "далее", "затем", "итак", "таким образом",
    "следовательно", "в итоге", "плюсы", "минусы", "плюс", "минус",
)
_REASONING_MARKERS = (
    "потому что", "поэтому", "так как", "следовательно", "значит", "из-за",
    "в результате", "причина", "следствие", "за счет", "за счёт", "благодаря",
    "отсюда следует", "это позволяет", "в отличие",
)
_EXAMPLE_MARKERS = (
    "например", "пример", "к примеру", "скажем", "такой как", "такие как",
    "for example", "e.g", "допустим", "представим",
)
_COMPARISON_MARKERS = (
    "отличается", "в отличие", "разница", "тогда как", "а не", "по сравнению",
)
_COMPARISON_MIN_WORDS = 4


def _expected_length(points: list[str], level: str) -> int:
    """Ожидаемая длина хорошего ответа в словах."""
    base = 30 + 15 * len(points) if points else 60
    factor = LEVEL_ANSWER_FACTOR.get(level, 1.0)
    return max(25, int(base * factor))


def _evaluate_text(
    *,
    question: dict[str, Any],
    answer_text: str,
    level: str,
) -> tuple[EvaluationResult, dict[str, Any]]:
    """Эвристическая оценка ответа; возвращает результат и служебные данные."""
    text = (answer_text or "").strip()
    low = _normalize(text)
    question_type = str(question.get("type") or "theory")
    topic = str(question.get("topic") or "Общее")
    points = _unique_strings(question.get("expected_points") or [], limit=8)

    all_words = _words(text)
    word_count = len(all_words)
    answer_tokens = _tokens(text)
    sentence_list = _sentences(text)
    sentence_count = len(sentence_list)
    expected = _expected_length(points, level)

    listed = bool(re.search(r"(?m)^\s*(?:\d+[.)]|[-*•])\s+\S", text))
    reasoning = any(marker in low for marker in _REASONING_MARKERS)
    examples = any(marker in low for marker in _EXAMPLE_MARKERS) or "```" in text
    comparison = any(marker in low for marker in _COMPARISON_MARKERS)
    structure = listed or reasoning or any(marker in low for marker in _STRUCTURE_MARKERS)

    is_code_answer = question_type == "code" or bool(
        re.search(r"\b(def|function|class|select|return|const|let|var)\b", low)
    )
    code_markers = sum(
        1
        for marker in ("def ", "return", "for ", "while ", "if ", "select", "join", "function", "=>")
        if marker in low
    )

    covered: list[str] = []
    missing: list[str] = []
    coverages: list[float] = []
    for point in points:
        value = _coverage(point, answer_tokens)
        coverages.append(value)
        if value >= 0.5:
            covered.append(point)
        else:
            missing.append(point)
    coverage = sum(coverages) / len(coverages) if coverages else 0.0

    if not points:
        question_tokens = [
            token
            for token in _tokens(str(question.get("text") or ""))
            if len(token) >= 4
        ]
        coverage = _overlap(question_tokens, answer_tokens) if question_tokens else 0.0

    length_factor = min(1.0, word_count / expected) if expected else 0.0
    unique_ratio = len(set(answer_tokens)) / len(answer_tokens) if answer_tokens else 1.0
    watery = word_count > 60 and coverage < 0.25 and unique_ratio < 0.6
    too_short = word_count < 10

    criteria: dict[str, float] = {}
    if word_count == 0:
        criteria = {key: 0.0 for key in CRITERIA_KEYS}
    elif word_count <= 3:
        base = 1.0 + 0.3 * word_count
        criteria = {key: _clamp(base) for key in CRITERIA_KEYS}
    else:
        correctness = 2.0 + 7.0 * coverage
        completeness = 1.5 + 8.0 * (0.7 * coverage + 0.3 * length_factor)
        depth = (
            1.5
            + 5.5 * coverage
            + (1.0 if reasoning else 0.0)
            + (0.5 if examples else 0.0)
            + (0.5 if comparison else 0.0)
            + min(0.5, length_factor * 0.5)
        )
        clarity = (
            4.0
            + (1.5 if listed else 0.0)
            + (1.0 if reasoning else 0.0)
            + (0.5 if examples else 0.0)
            + (0.5 if structure else 0.0)
            + (0.5 if sentence_count >= 3 else 0.0)
            + (0.5 if 10 <= word_count <= 320 else 0.0)
        )
        if is_code_answer:
            correctness += min(0.5, code_markers * 0.1)
            clarity += min(2.0, code_markers * 0.3)
            depth += min(1.5, code_markers * 0.25)
        if too_short:
            correctness = min(correctness, 3.0)
            completeness = min(completeness, 2.5)
            depth = min(depth, 2.5)
        if points and not missing:
            correctness += 0.5
            completeness += 1.0
        if watery:
            correctness -= 1.5
            completeness -= 1.5
            clarity -= 1.0
            depth -= 0.5
        if word_count > 400 and not listed:
            clarity -= 1.0
        criteria = {
            "correctness": _clamp(correctness),
            "completeness": _clamp(completeness),
            "depth": _clamp(depth),
            "clarity": _clamp(clarity),
        }

    score = _clamp(sum(criteria.values()) / len(criteria)) if word_count else 0.0

    strengths: list[str] = []
    for point in covered[:3]:
        strengths.append(f"Верно раскрыт пункт: {_shorten(point)}")
    if reasoning:
        strengths.append("Показано понимание причин и механизмов, а не только определений.")
    if examples:
        strengths.append("Приведён практический пример — это усиливает ответ.")
    if listed:
        strengths.append("Ответ структурирован: пункты и списки упрощают восприятие.")
    if word_count >= expected * 0.8 and coverage >= 0.5:
        strengths.append("Ответ достаточно подробный и по существу.")
    if is_code_answer and code_markers >= 3:
        strengths.append("В ответе есть код с основными конструкциями (ветвления/циклы/возврат).")
    if not strengths:
        if word_count <= 3:
            strengths.append("Ответ по теме зафиксирован, но раскрыт крайне мало.")
        else:
            strengths.append("Ответ относится к теме вопроса, направление мысли верное.")

    gaps: list[str] = []
    for point in missing[:4]:
        gaps.append(f"Не раскрыто: {_shorten(point)}")
    if too_short:
        gaps.append("Ответ слишком короткий: добавьте определение, механизм работы и пример.")
    if not listed and not structure:
        gaps.append("Не хватает структуры: перечислите ключевые пункты по порядку.")
    if not reasoning:
        gaps.append("Мало объяснений «почему»: добавьте причины, следствия и компромиссы.")
    if not examples:
        gaps.append("Нет практического примера применения.")
    if watery:
        gaps.append("Много общих слов и мало конкретики по существу вопроса.")
    if points and coverage < 0.5:
        gaps.append("Покрыта лишь часть ожидаемых пунктов ответа.")
    if not gaps:
        gaps.append("Углубите ответ: добавьте ограничения, компромиссы и граничные случаи.")

    ideal_answer = _build_ideal_answer(topic=topic, points=points, question=question)
    recommendation = _build_recommendation(
        score=score, topic=topic, gaps=missing or gaps, watery=watery, too_short=too_short
    )
    follow_up = _build_follow_up(
        topic=topic, missing=missing, question=question, score=score
    )

    result = EvaluationResult(
        score=score,
        criteria=criteria,
        strengths=strengths[:5],
        gaps=gaps[:5],
        ideal_answer=ideal_answer,
        recommendation=recommendation,
        follow_up_question=follow_up,
    )
    details = {
        "word_count": word_count,
        "coverage": round(coverage, 2),
        "covered_points": covered,
        "missing_points": missing,
        "watery": watery,
        "too_short": too_short,
        "expected_words": expected,
        "structure": structure,
        "reasoning": reasoning,
        "examples": examples,
        "listed": listed,
    }
    return result, details


def _shorten(text: str, limit: int = 90) -> str:
    """Обрезает длинный пункт до читаемой длины."""
    value = " ".join((text or "").split())
    if len(value) <= limit:
        return value
    cut = value[:limit]
    if " " in cut:
        cut = cut.rsplit(" ", 1)[0]
    return cut.rstrip(" ,.;:") + "…"


def _build_ideal_answer(*, topic: str, points: list[str], question: dict[str, Any]) -> str:
    """Собирает эталонный ответ из ожидаемых пунктов."""
    if points:
        numbered = "\n".join(
            f"{index}. {point[0].upper() + point[1:] if point else point}"
            for index, point in enumerate(points, start=1)
        )
        return (
            f"Эталонный ответ по теме «{topic}»:\n{numbered}\n\n"
            "Сильный ответ не только перечисляет пункты, но и объясняет механизм, "
            "приводит пример и называет ограничения."
        )
    question_text = " ".join(str(question.get("text") or "").split())
    return (
        f"Эталонный ответ по теме «{topic}»: сформулируйте определение, объясните механизм "
        f"работы, приведите практический пример и назовите ограничения. "
        f"Ориентир — вопрос: {question_text}"
    )


def _build_recommendation(
    *,
    score: float,
    topic: str,
    gaps: list[str],
    watery: bool,
    too_short: bool,
) -> str:
    """Конкретная рекомендация по итогам одного ответа."""
    first_gap = _shorten(gaps[0], 110) if gaps else ""
    if score >= 8.5:
        return (
            f"Отличный ответ по теме «{topic}». Закрепите результат: ответьте на смежный "
            "вопрос вслух и проверьте себя по эталону из 3–4 пунктов."
        )
    if score >= 6.5:
        base = f"Хороший ответ по теме «{topic}», но есть что усилить."
        return f"{base} {('Сначала закройте: ' + first_gap) if first_gap else 'Добавьте больше деталей и примеров.'}"
    if score >= 4.0:
        return (
            f"Базовый уровень по теме «{topic}». Повторите ключевые определения и разберите: "
            f"{first_gap or 'основные механизмы темы'}. Затем ответьте на вопрос ещё раз, "
            "используя структуру «определение → механизм → пример → ограничения»."
        )
    if too_short:
        return (
            f"Ответ по теме «{topic}» слишком короткий. Начните с определения и 2–3 ключевых "
            "тезисов, затем добавьте пример. Постарайтесь говорить 1–2 минуты."
        )
    if watery:
        return (
            f"В ответе по теме «{topic}» много общих слов. Перейдите к конкретике: "
            f"{first_gap or 'перечислите ключевые пункты и объясните каждый'}."
        )
    return (
        f"Тема «{topic}» раскрыта слабо. Начните с базы: выпишите 3–5 ключевых понятий "
        "и их определения, затем разберите пример. Ответьте на этот вопрос повторно."
    )


def _build_follow_up(
    *,
    topic: str,
    missing: list[str],
    question: dict[str, Any],
    score: float,
) -> str:
    """Уточняющий вопрос по слабому месту ответа."""
    if missing:
        point = _shorten(missing[0], 110)
        return f"Можете раскрыть подробнее: {point}?"
    if score < 7:
        return f"Приведите конкретный пример применения этой темы на практике."
    return f"Как бы вы объяснили тему «{topic}» коллеге за 30 секунд?"


# ============================================================ чат: база знаний
_KB: list[dict[str, Any]] = [
    {
        "topic": "Python и базовые типы",
        "keywords": (
            "python", "питон", "list", "tuple", "список", "кортеж", "изменяем",
            "mutable", "immutable", "dict", "словар", "set", "множеств", "str",
        ),
        "answer": (
            "В Python ключевое различие между типами — изменяемость (mutable/immutable). "
            "Списки (list) изменяемые: их можно дополнять, удалять элементы и менять по индексу. "
            "Кортежи (tuple) неизменяемые: после создания их содержимое не меняется, поэтому они хешируемы "
            "и могут выступать ключами словаря или элементами множества. "
            "Неизменяемые объекты обычно немного компактнее и безопаснее: никто случайно не изменит данные. "
            "Изменяемые удобны, когда коллекция должна расти и меняться: очереди, буферы, накопители. "
            "Важный нюанс: изменяемый объект внутри кортежа всё равно можно изменить — неизменяемость tuple поверхностная. "
            "На собеседовании стоит добавить про хешируемость, словари и множества: ключи должны быть неизменяемыми. "
            "Практическое правило: по умолчанию выбирайте tuple для фиксированных данных, list — для коллекций, "
            "которые будут меняться."
        ),
    },
    {
        "topic": "GIL и многопоточность",
        "keywords": (
            "gil", "гил", "глобальн", "блокировк", "поток", "thread", "threading",
            "многопоточ", "multiprocessing", "многопроцесс", "cpu", "параллел",
        ),
        "answer": (
            "GIL (Global Interpreter Lock) — глобальная блокировка интерпретатора CPython, которая разрешает "
            "выполнять байткод только одному потоку в единицу времени. "
            "Поэтому несколько потоков не дают параллелизма для CPU-задач: они по очереди получают GIL. "
            "Для задач ввода-вывода (сеть, файлы, БД) потоки всё равно полезны: пока один поток ждёт ответа, "
            "другие выполняют работу, и GIL на это время отпускается. "
            "Для CPU-нагрузки в Python используют multiprocessing (отдельные процессы, у каждого свой GIL), "
            "C-расширения (NumPy, Cython), асинхронность или вынос вычислений во внешние сервисы. "
            "В Python 3.13+ появился экспериментальный free-threaded режим без GIL, но он пока не стал умолчанием. "
            "На собеседовании важно показать понимание: GIL не делает потоки бесполезными, он ограничивает "
            "параллельное выполнение именно Python-байткода."
        ),
    },
    {
        "topic": "Генераторы и ленивые вычисления",
        "keywords": (
            "генератор", "yield", "итератор", "iterator", "ленив", "iter", "next",
            "ленивые вычисления", "бесконечн", "потоков",
        ),
        "answer": (
            "Генератор — это функция с yield, которая возвращает значения по одному, сохраняя своё состояние "
            "между вызовами. "
            "В отличие от списка, генератор не хранит все элементы в памяти: он вычисляет следующий элемент "
            "по требованию, то есть реализует ленивые вычисления. "
            "Это выгодно для больших или бесконечных последовательностей: чтение файла построчно, обработка "
            "потока данных, пайплайны map/filter. "
            "Генератор — одновременно итератор: следующий элемент получают через next(), а когда значения "
            "закончились, поднимается StopIteration. "
            "Недостаток: генератор одноразовый — после прохода его нужно создавать заново, и к элементам нельзя "
            "обращаться по индексу. "
            "Практический пример: вместо readlines() у файла читают его в цикле for line in file — память "
            "расходуется на одну строку, а не на весь файл. "
            "На собеседовании полезно упомянуть yield from для делегирования и генераторные выражения вместо "
            "списковых, когда результат нужен один раз."
        ),
    },
    {
        "topic": "ООП и принципы проектирования",
        "keywords": (
            "ооп", "класс", "наследован", "композиц", "инкапсул", "полиморф",
            "solid", "абстракц", "интерфейс", "проектирован",
        ),
        "answer": (
            "Основные идеи ООП — инкапсуляция, наследование и полиморфизм, но на практике важнее "
            "разумная декомпозиция и низкая связанность. "
            "Наследование выражает отношение «является» и оправдано, когда у классов общий контракт и поведение. "
            "Композиция выражает отношение «содержит» и обычно гибче: зависимости можно подменять, "
            "поведение собирается из небольших частей. "
            "Принцип «предпочитайте композицию наследованию» помогает избежать хрупких иерархий. "
            "SOLID напоминает: у класса одна причина для изменения (S), класс открыт для расширения и закрыт для "
            "изменения (O), подклассы не ломают контракт базового класса (L), интерфейсы узкие (I), "
            "зависимости направлены на абстракции (D). "
            "Пример нарушения: класс одновременно считает бизнес-логику, пишет в БД и логирует — его нужно "
            "разделить на сервис, репозиторий и логгер. "
            "Итог: минимизируйте связанность, выделяйте обязанности и проектируйте под тесты."
        ),
    },
    {
        "topic": "SQL: JOIN, WHERE, HAVING",
        "keywords": (
            "sql", "select", "join", "where", "having", "group by", "order by",
            "запрос", "таблиц", "агрегац", "left join", "inner join",
        ),
        "answer": (
            "SQL-запрос логически выполняется в порядке: FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT. "
            "INNER JOIN оставляет только строки, которые есть в обеих таблицах; LEFT JOIN сохраняет все строки "
            "левой таблицы, а для отсутствующих совпадений подставляет NULL. "
            "WHERE фильтрует строки до агрегации, поэтому в нём нельзя использовать агрегатные функции. "
            "HAVING фильтрует уже сгруппированные данные: например, WHERE created_at > ... и "
            "HAVING count(*) > 5. "
            "Оконные функции (ROW_NUMBER, RANK, SUM() OVER (PARTITION BY ...)) считают агрегаты, не сворачивая "
            "строки, и удобны для рейтингов и долей. "
            "Частая ошибка — фильтр по правой таблице LEFT JOIN в WHERE: это превращает его в INNER JOIN, "
            "такой фильтр нужно писать в ON. "
            "Практический совет: сначала опишите таблицы и ожидаемый результат словами, затем соберите запрос "
            "по шагам и проверьте план EXPLAIN."
        ),
    },
    {
        "topic": "Индексы в базах данных",
        "keywords": (
            "индекс", "b-tree", "btree", "cardinal", "селектив", "составной индекс",
            "индексир", "полнотекстов", "gist", "gin",
        ),
        "answer": (
            "Индекс — дополнительная структура данных (обычно B-tree) для быстрого поиска строк без полного "
            "перебора таблицы. "
            "Он ускоряет WHERE, JOIN и ORDER BY по индексированным колонкам, но замедляет вставку, обновление "
            "и удаление, потому что индекс тоже нужно поддерживать. "
            "Индекс занимает место на диске и в памяти, поэтому индексировать все подряд — плохая идея. "
            "Стоит индексировать колонки с высокой селективностью, внешние ключи и поля частых фильтров. "
            "Составной индекс работает по правилу левого префикса: индекс (a, b) поможет для условия по a "
            "и по a и b, но не для условия только по b. "
            "Для поиска по подстроке может понадобиться полнотекстовый индекс или pg_trgm, а для JSON — GIN. "
            "Практический совет: смотрите EXPLAIN (ANALYZE), проверяйте Seq Scan на больших таблицах и "
            "сравнивайте реальное время до и после добавления индекса."
        ),
    },
    {
        "topic": "Транзакции и уровни изоляции",
        "keywords": (
            "транзакц", "изоляц", "acid", "commit", "rollback", "сериализ",
            "фантом", "грязн", "дедлок", "deadlock", "блокировк", "mvcc",
        ),
        "answer": (
            "Транзакция — набор операций, который выполняется как единое целое: либо все изменения применяются "
            "(COMMIT), либо ни одно (ROLLBACK). "
            "Свойства ACID: атомарность, согласованность, изоляция и долговечность. "
            "Уровни изоляции управляют компромиссом между консистентностью и конкурентностью: "
            "Read Uncommitted допускает грязное чтение, Read Committed запрещает его, Repeatable Read "
            "стабилизирует повторное чтение, Serializable исключает фантомы ценой сериализации. "
            "В PostgreSQL по умолчанию Read Committed, и он реализован через MVCC: читатели не блокируют "
            "писателей, каждый видит свой снимок данных. "
            "Типичные аномалии: грязное чтение, неповторяющееся чтение, фантомные строки. "
            "Дедлок возникает, когда транзакции ждут блокировки друг друга; лечится единым порядком захвата "
            "ресурсов, короткими транзакциями и повторной попыткой. "
            "На собеседовании приведите пример перевода денег: списание и зачисление должны быть в одной "
            "транзакции с проверкой баланса."
        ),
    },
    {
        "topic": "HTTP и сети",
        "keywords": (
            "http", "https", "статус", "status", "200", "404", "500", "метод",
            "get", "post", "put", "patch", "delete", "заголовк", "header",
            "cookie", "cors", "tls", "кэш", "cache", "dns", "tcp", "url", "браузер",
        ),
        "answer": (
            "HTTP — прикладной протокол «запрос-ответ»: клиент отправляет метод, путь, заголовки и тело, "
            "сервер возвращает статус, заголовки и тело. "
            "Основные методы: GET (получить), POST (создать/обработать), PUT (заменить ресурс), "
            "PATCH (частично изменить), DELETE (удалить). "
            "Коды статусов делятся на группы: 2xx успех, 3xx перенаправление, 4xx ошибка клиента, "
            "5xx ошибка сервера. "
            "PUT и DELETE идемпотентны: повторный запрос даёт тот же результат, а POST — нет. "
            "Заголовки управляют форматом тела, авторизацией, кэшем (Cache-Control, ETag) и cookie. "
            "Поверх HTTP работают TLS (шифрование), DNS (определение IP) и TCP (надёжная доставка). "
            "Понимание этих уровней важно: на собеседовании часто спрашивают, что происходит от ввода URL "
            "до рендера страницы. "
            "Практический совет: используйте правильные статусы и не отдавайте 200 с полем error — это "
            "ломает клиентов и мониторинг."
        ),
    },
    {
        "topic": "REST API и проектирование",
        "keywords": (
            "rest", "api", "идемпотент", "ресурс", "endpoint", "эндпоинт", "crud",
            "pagination", "пагинац", "версионир", "openapi", "swagger",
        ),
        "answer": (
            "REST — архитектурный стиль, где всё рассматривается как ресурсы с адресами (URL), а действия "
            "выражаются HTTP-методами. "
            "Хороший REST API предсказуем: /users — коллекция, /users/42 — конкретный ресурс, "
            "GET/POST/PUT/PATCH/DELETE описывают операцию. "
            "Ключевые свойства: идемпотентность (повтор GET/PUT/DELETE безопасен), статelessness "
            "(сервер не хранит состояние клиента между запросами) и единый формат ошибок. "
            "Для списков используют пагинацию (limit/offset или cursor), фильтры в query-параметрах и "
            "предсказуемую сортировку. "
            "Версионируют API через путь (/api/v1) или заголовок; ломающие изменения выпускают в новой версии. "
            "Аутентификацию обычно делают через токен в заголовке Authorization: Bearer ... "
            "Практический совет: опишите контракт (OpenAPI), валидируйте входы, возвращайте понятные коды "
            "и не смешивайте бизнес-логику с форматированием ответа."
        ),
    },
    {
        "topic": "React: состояние и ререндер",
        "keywords": (
            "react", "компонент", "state", "props", "пропс", "состояни", "ререндер",
            "jsx", "виртуальн", "virtual dom", "key", "ключ",
        ),
        "answer": (
            "React-компонент — функция, которая превращает пропсы и состояние в описание UI (JSX). "
            "Пропсы передаются снаружи и неизменяемы внутри компонента, а state принадлежит компоненту и "
            "меняется через setState/useState. "
            "Изменение state или пропсов вызывает ререндер: React строит новое виртуальное дерево и "
            "сравнивает его с предыдущим (diffing), обновляя только изменившиеся узлы реального DOM. "
            "Виртуальный DOM — лёгкое представление UI в памяти, которое делает обновления точечными. "
            "В списках важны стабильные key: по ним React сопоставляет элементы между ререндерами; "
            "индекс массива как key ломает поведение при сортировке и вставках. "
            "Состояние поднимают вверх к общему родителю, если его нужно разделить между компонентами. "
            "Практический совет: держите состояние минимальным, не дублируйте вычисляемые данные в state, "
            "а тяжёлые вычисления оборачивайте в useMemo."
        ),
    },
    {
        "topic": "React-хуки",
        "keywords": (
            "хук", "hook", "usestate", "useeffect", "usememo", "usecallback",
            "useref", "зависимост", "reducer", "context",
        ),
        "answer": (
            "Хуки — функции, которые дают функциональным компонентам доступ к состоянию и жизненному циклу. "
            "useState управляет состоянием, useEffect выполняет побочные эффекты после рендера, "
            "useMemo и useCallback кэшируют значения и функции, useRef хранит изменяемое значение без ререндера. "
            "Правила хуков: вызывать только на верхнем уровне компонента или кастомного хука, "
            "не внутри условий, циклов и вложенных функций — React полагается на порядок вызовов. "
            "В useEffect важно правильно указать зависимости: пустой массив — только монтирование, "
            "без массива — после каждого рендера (частая причина бесконечных циклов). "
            "Если эффект подписывается на что-то, функция очистки должна отписаться: это защита от утечек. "
            "Кастомные хуки позволяют переиспользовать логику между компонентами без наследования. "
            "Практический совет: если состояние можно вычислить из пропсов — не заводите для него state, "
            "а вычислите во время рендера или в useMemo."
        ),
    },
    {
        "topic": "Тестирование",
        "keywords": (
            "тест", "тестир", "юнит", "unit", "интеграц", "pytest", "jest",
            "mock", "мок", "покрыт", "tdd", "пирамид", "assert", "фикстур",
        ),
        "answer": (
            "Тесты делят по уровню: юнит-тесты проверяют маленькую изолированную единицу кода, "
            "интеграционные — взаимодействие компонентов (БД, API, внешние сервисы), e2e — сценарии "
            "через реальный интерфейс. "
            "Пирамида тестирования: много быстрых юнит-тестов, меньше интеграционных и совсем немного e2e. "
            "Юнит-тесты быстрые, стабильные и точно локализуют ошибку; интеграционные ловят проблемы "
            "стыковки, но дороже и медленнее. "
            "Хороший тест проверяет поведение, а не реализацию: сценарий «на входе — на выходе», "
            "понятное имя и один смысл на тест. "
            "Моками заменяют внешние зависимости (сеть, время, БД), чтобы тест был детерминированным. "
            "TDD — цикл «красный → зелёный → рефакторинг»: сначала падающий тест, затем минимальная "
            "реализация и улучшение кода. "
            "Практический совет: покрывайте в первую очередь бизнес-логику и крайние случаи, а не "
            "геттеры; следите, чтобы тесты не зависели от порядка запуска."
        ),
    },
    {
        "topic": "Git",
        "keywords": (
            "git", "гит", "ветк", "branch", "merge", "rebase", "коммит",
            "commit", "конфликт", "pull request", "cherry-pick", "stash",
        ),
        "answer": (
            "Git — распределённая система контроля версий: каждый коммит хранит снимок состояния проекта "
            "и ссылку на родителя, а ветка — это подвижный указатель на коммит. "
            "Основные операции: git add готовит изменения, git commit фиксирует, git branch/checkout "
            "переключают ветки, git merge вливает одну ветку в другую. "
            "merge сохраняет историю ветвления и создаёт merge-коммит, rebase переносит коммиты поверх "
            "другой ветки и делает историю линейной. "
            "Rebase удобно делать в своей локальной ветке до ревью; в общих ветках это опасно, потому что "
            "переписывает уже опубликованную историю. "
            "Конфликт возникает, когда два коммита меняют одни и те же строки: Git помечает участок, "
            "и разработчик вручную выбирает итоговый вариант. "
            "Pull request — не только запрос на слияние, но и площадка для ревью, обсуждения и CI-проверок. "
            "Практический совет: делайте небольшие атомарные коммиты с осмысленными сообщениями, "
            "перед rebase используйте git stash или отдельную ветку, а историю не переписывайте без "
            "согласования с командой."
        ),
    },
    {
        "topic": "Docker и контейнеры",
        "keywords": (
            "docker", "докер", "контейнер", "образ", "image", "dockerfile",
            "сло", "kubernetes", "k8s", "compose", "volume", "registry",
        ),
        "answer": (
            "Docker упаковывает приложение и его зависимости в образ — неизменяемый шаблон, из которого "
            "запускается контейнер. "
            "Образ состоит из слоёв: каждая инструкция Dockerfile (FROM, COPY, RUN) добавляет слой, "
            "и Docker кэширует их. "
            "Поэтому зависимости копируют раньше кода: если не менялись requirements/package.json, "
            "слой с установкой пакетов берётся из кэша. "
            "Контейнер — запущенный экземпляр образа; он изолирован, но разделяет ядро ОС с хостом "
            "(в отличие от виртуальной машины). "
            "Данные, которые должны переживать перезапуск, выносят в volume; порты публикуют через -p. "
            "Multi-stage сборка позволяет не тащить в финальный образ компиляторы и тестовые зависимости. "
            "Практический совет: используйте минимальный базовый образ, не запускайте процесс от root, "
            "добавьте .dockerignore и фиксируйте версии базовых образов. "
            "Для оркестрации нескольких сервисов в разработке часто используют docker compose, "
            "а в продакшене — Kubernetes."
        ),
    },
    {
        "topic": "Алгоритмы и структуры данных",
        "keywords": (
            "алгоритм", "сложност", "big o", "o(n)", "структур данных", "массив",
            "хеш", "hash", "дерев", "граф", "сортиров", "бинарн", "стек", "очеред",
            "динамическ", "рекурси",
        ),
        "answer": (
            "Big O описывает рост времени или памяти алгоритма при увеличении входа, отбрасывая константы. "
            "Типичные классы: O(1) — доступ по индексу/хешу, O(log n) — бинарный поиск и сбалансированное "
            "дерево, O(n) — один проход, O(n log n) — эффективные сортировки, O(n²) — вложенные циклы. "
            "Выбор структуры данных — это компромисс: массив даёт быстрый доступ по индексу, но медленную "
            "вставку в середину; хеш-таблица — поиск в среднем O(1) и O(n) в худшем; связный список — "
            "быстрая вставка, но медленный поиск; куча — быстрый минимум/максимум. "
            "Перед решением сформулируйте ограничения: размер входа, память, допустимая сложность по времени. "
            "Часто выигрывает подход с хеш-таблицей: он превращает вложенный поиск в один проход. "
            "Для задач на собеседовании проговаривайте сложность вслух: интервьюеру важно не только решение, "
            "но и понимание ограничений. "
            "Практический совет: сначала напишите перебор и оцените его, затем оптимизируйте по узкому месту."
        ),
    },
]

_KB_BY_TOPIC = {entry["topic"]: entry for entry in _KB}

TOPICS_HINT = "Python, GIL, генераторы, ООП, SQL, индексы, транзакции, HTTP, REST, React, хуки, тестирование, Git, Docker, алгоритмы"


# Общие («зонтичные») слова, которые сами по себе не определяют тему: они
# встречаются в вопросах про разные темы, поэтому получают минимальный вес.
# Так «Что такое GIL в Python?» уходит в тему GIL, а не в «Python и типы».
_GENERIC_KEYWORDS = frozenset(
    {
        "python", "питон", "sql", "api", "react", "git", "гит", "docker", "докер",
        "http", "https", "тест", "тестир", "алгоритм", "класс", "ооп", "сеть",
        "сети", "поток", "браузер", "url",
    }
)


def _keyword_position(keyword: str, text: str) -> int:
    """Позиция первого вхождения ключевого слова (-1, если не найдено)."""
    value = keyword.strip().lower()
    if not value:
        return -1
    if re.fullmatch(r"[a-z0-9+#.\-]+", value):
        match = re.search(rf"\b{re.escape(value)}\b", text)
        return match.start() if match else -1
    return text.find(value)


def _keyword_weight(keyword: str) -> int:
    """Вес ключевого слова: специфичные термины весят больше общих."""
    value = keyword.strip().lower()
    if value in _GENERIC_KEYWORDS:
        return 1
    return 3 if len(value) >= 6 else 2


def _rank_topics(query: str) -> list[tuple[int, int, dict[str, Any]]]:
    """Ранжирует темы базы знаний по релевантности запросу."""
    text = _normalize(query)
    if not text.strip():
        return []
    ranked: list[tuple[int, int, dict[str, Any]]] = []
    for entry in _KB:
        score = 0
        positions: list[int] = []
        for keyword in entry["keywords"]:
            position = _keyword_position(keyword, text)
            if position < 0:
                continue
            score += _keyword_weight(keyword)
            positions.append(position)
        if score > 0:
            ranked.append((score, min(positions) if positions else len(text), entry))
    ranked.sort(key=lambda item: (-item[0], item[1]))
    return ranked


def _detect_topic(query: str) -> dict[str, Any] | None:
    """Определяет тему базы знаний по ключевым словам запроса.

    Специфичные термины (GIL, индекс, транзакция, хуки…) весят больше общих
    («Python», «SQL»), поэтому ответ всегда соответствует спрошенной теме.
    При равенстве баллов побеждает тема, чьё ключевое слово встретилось раньше.
    """
    ranked = _rank_topics(query)
    return ranked[0][2] if ranked else None


_COMPARISON_MARKERS = ("vs", "versus", "разниц", "отлича", "сравн", "против", "difference")


def _is_comparison_query(query: str) -> bool:
    """Похож ли вопрос на сравнение двух тем."""
    text = _normalize(query)
    return any(marker in text for marker in _COMPARISON_MARKERS)


_GREETING_MARKERS = ("привет", "здравствуй", "добрый день", "добрый вечер", "hello", "hi ")


def _greeting_answer() -> str:
    return (
        "Привет! Я — офлайн-ассистент тренажёра для подготовки к техническим собеседованиям. "
        f"Могу объяснить темы: {TOPICS_HINT}. "
        "Спросите, например: «Что такое GIL?», «Зачем нужны индексы в БД?», "
        "«Чем PUT отличается от PATCH?» или «Как устроены хуки в React?». "
        "Отвечу по существу: определение, ключевые пункты, пример и вывод."
    )


def _fallback_chat_answer(query: str) -> str:
    return (
        "Не нашёл однозначной темы в вопросе, поэтому подскажу, с чего начать. "
        f"Я хорошо разбираю темы: {TOPICS_HINT}. "
        f"По вашему вопросу «{_shorten(query, 120)}» уточните, пожалуйста, что именно интересует: "
        "определение, сравнение технологий или пример на практике. "
        "Если вопрос из технического собеседования — я разберу его по структуре: "
        "определение → механизм → пример → типичные ошибки и ограничения."
    )


def _chat_answer(query: str, context: str | None = None) -> str:
    """Детерминированный ответ ассистента по базе знаний."""
    ranked = _rank_topics(query)
    if not ranked:
        if any(marker in _normalize(query) for marker in _GREETING_MARKERS):
            answer = _greeting_answer()
        else:
            answer = _fallback_chat_answer(query)
    elif (
        _is_comparison_query(query)
        and len(ranked) >= 2
        and ranked[1][0] >= 2
        and ranked[1][2] is not ranked[0][2]
    ):
        first = ranked[0][2]
        second = ranked[1][2]
        answer = (
            f"Сравним две темы: «{first['topic']}» и «{second['topic']}». "
            "Сначала разберём первую, затем вторую — так сравнение будет честным.\n\n"
            f"**{first['topic']}.** {first['answer']}\n\n"
            f"**{second['topic']}.** {second['answer']}\n\n"
            "Вывод: это разные уровни обсуждения — не смешивайте их, "
            "и на собеседовании отвечайте сначала про один, затем про другой."
        )
    else:
        answer = ranked[0][2]["answer"]
    if context and str(context).strip():
        answer = f"Контекст текущего вопроса: {_shorten(str(context).strip(), 200)}\n\n{answer}"
    return answer


def _split_for_stream(text: str) -> list[str]:
    """Готовит куски ответа для потоковой выдачи (по предложениям)."""
    sentences = _sentences(text)
    if not sentences:
        return [text] if text else []
    chunks: list[str] = []
    for index, sentence in enumerate(sentences):
        suffix = " " if index < len(sentences) - 1 else ""
        chunks.append(sentence + suffix)
    return chunks


# ============================================================ код: шаблоны
_LANGUAGE_STARTERS: dict[str, str] = {
    "python": (
        "def solve(nums: list[int]) -> int | None:\n"
        "    # ваш код\n"
        "    ...\n"
    ),
    "javascript": (
        "function solve(nums) {\n"
        "  // ваш код\n"
        "}\n"
    ),
    "typescript": (
        "function solve(nums: number[]): number | null {\n"
        "  // ваш код\n"
        "}\n"
    ),
    "java": (
        "class Solution {\n"
        "    public static Integer solve(int[] nums) {\n"
        "        // ваш код\n"
        "        return null;\n"
        "    }\n"
        "}\n"
    ),
    "c++": (
        "#include <optional>\n"
        "#include <vector>\n\n"
        "std::optional<int> solve(const std::vector<int>& nums) {\n"
        "    // ваш код\n"
        "    return std::nullopt;\n"
        "}\n"
    ),
    "sql": "-- ваш запрос\nSELECT ...\n",
}

_SQL_TASK_DESCRIPTION = (
    "Есть таблицы orders(id, user_id, amount, created_at) и users(id, city). "
    "Верните по каждому городу количество заказов и сумму amount за последние 30 дней; "
    "города без заказов тоже должны попасть в результат со значением 0.\n\n"
    "Пример: Москва — 12 заказов на 15400; Казань — 0 заказов на 0."
)

_SQL_DESCRIPTION_BY_DIFFICULTY = {
    "easy": (
        "Есть таблица orders(id, user_id, amount, created_at). "
        "Верните количество заказов и суммарную сумму amount по каждому user_id.\n\n"
        "Пример: user_id = 7 → 3 заказа на 4500."
    ),
    "medium": _SQL_TASK_DESCRIPTION,
    "hard": (
        "Есть таблицы orders(id, user_id, amount, created_at) и users(id, city, created_at). "
        "Верните города, у которых средний чек за последние 30 дней выше среднего чека по всем городам, "
        "и разницу в процентах.\n\n"
        "Пример: Москва — средний чек 2100 на 8% выше общего."
    ),
}


def _python_loop_depth(source: str) -> int:
    """Максимальная вложенность циклов for/while (по отступам Python)."""
    depth = 0
    max_depth = 0
    for line in source.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        indent = len(line) - len(line.lstrip(" \t"))
        if not stripped.startswith(("for ", "while ")):
            continue
        current = indent // 4 + 1
        if current <= depth:
            depth = current - 1
        depth = current
        max_depth = max(max_depth, depth)
    return max_depth


def _generic_loop_depth(source: str, language: str) -> int:
    """Грубая оценка вложенности циклов для не-Python языков (по скобкам/отступам)."""
    if language == "sql":
        return 0
    lower = source.lower()
    has_double = bool(
        re.search(r"for\s*\([^)]*\)\s*\{[^}]*for\s*\(", lower)
        or re.search(r"for\s*\([^)]*\)\s*:[^:]*for\s*\(", lower)
    )
    if has_double:
        return 2
    return 1 if re.search(r"\b(for|while)\b", lower) else 0


def _has_edge_handling(source: str, language: str) -> bool:
    """Признаки обработки крайних случаев (пустой вход, None/null, границы)."""
    if language == "sql":
        lower = source.lower()
        return any(marker in lower for marker in ("coalesce", "left join", "is null", "ifnull", ">= 0", "> 0"))
    lowered = _normalize(source)
    markers = (
        "if not ", "is none", "is not none", "== 0", "len(", ".length", "!= null",
        "=== null", "nullptr", "empty", "пуст", "if (", "if(", "try:", "except", "catch",
        "try {", "raise ", "throw ", "or []", " or {}",
    )
    return any(marker in lowered for marker in markers)


def _starter_for_language(language: str) -> str:
    return _LANGUAGE_STARTERS.get(language, _LANGUAGE_STARTERS["python"])


def _infer_complexity(source: str, depth: int) -> tuple[str, str]:
    """Определяет сложность по эвристикам."""
    if depth >= 3:
        time_text = "O(n³) — тройная вложенность циклов, скорее всего избыточна"
    elif depth == 2:
        time_text = "O(n²) — два уровня вложенных циклов"
    elif depth == 1:
        time_text = "O(n) — один проход по входным данным"
    else:
        time_text = "O(1) или O(log n) — явных циклов по данным нет"
    lower = source.lower()
    if any(marker in lower for marker in ("set(", "dict(", "list(", "{", "[", "new ", "map(", "filter(")):
        space_text = "O(n) — создаются новые коллекции"
    else:
        space_text = "O(1) — дополнительная память не растёт"
    return time_text, space_text


def _function_body_lines(source: str) -> list[tuple[int, str]] | None:
    """Возвращает строки тела первой Python-функции с их отступами."""
    lines = source.splitlines()
    start = -1
    for index, line in enumerate(lines):
        if re.match(r"^\s*(async\s+)?def\s+[A-Za-z_]\w*\s*\(", line):
            start = index
            break
    if start < 0:
        return None
    body: list[tuple[int, str]] = []
    for line in lines[start + 1 :]:
        if not line.strip():
            body.append((0, ""))
            continue
        indent = len(line) - len(line.lstrip(" \t"))
        if indent == 0:
            break
        body.append((indent, line))
    return body


def _improved_code(source: str, language: str, title: str | None) -> str:
    """Собирает шаблон улучшенного решения (best practice)."""
    checklist = (
        "1. Обработайте крайние случаи в начале функции: пустой вход, None/null, один элемент.",
        "2. Дайте функции осмысленное имя и docstring с контрактом (вход, выход, исключения).",
        "3. Разбейте сложную логику на небольшие функции с одной ответственностью.",
        "4. Сведите сложность к O(n) или O(n log n): избегайте вложенных циклов по данным.",
        "5. Добавьте тесты: обычный случай, границы и пустой вход.",
    )
    task_hint = f" по задаче «{title}»" if title else ""
    if language == "python":
        match = re.search(
            r"(?m)^(\s*def\s+([A-Za-z_]\w*)\s*\([^)]*\)[^\n:]*:)", source
        )
        signature = match.group(1).strip() if match else "def solve(data):"
        name = match.group(2) if match else "solve"
        header = "\n".join(f"# {item}" for item in checklist)
        return (
            f"# Улучшенный вариант решения{task_hint} (best practice):\n"
            f"{header}\n\n"
            f"{signature}\n"
            f'    """Кратко опишите назначение функции «{name}».\n\n'
            "    Args:\n"
            "        data: входные данные и их формат.\n\n"
            "    Returns:\n"
            "        Результат и его тип.\n\n"
            "    Raises:\n"
            "        ValueError: при некорректном входе.\n\n"
            "    Сложность: O(n) по времени, O(1) дополнительной памяти.\n"
            '    """\n'
            "    # 1. Крайние случаи.\n"
            "    if data is None:\n"
            "        return None\n"
            "    if not data:\n"
            "        return None\n\n"
            "    # 2. Основная логика: один проход по данным, без вложенных циклов.\n"
            "    result = None\n"
            "    for value in data:\n"
            "        # TODO: обработайте элемент\n"
            "        _ = value\n\n"
            "    # 3. Возврат результата.\n"
            "    return result\n"
        )
    prefix = "//" if language in ("javascript", "typescript", "java", "c++") else "--"
    header = "\n".join(f"{prefix} {item}" for item in checklist)
    return (
        f"{prefix} Улучшенный вариант решения{task_hint} (best practice):\n"
        f"{header}\n\n"
        f"{_starter_for_language(language)}"
    )


# ==================================================================== движок
class OfflineEngine(AIService):
    """Детерминированный офлайн-движок без обращений к сети."""

    @property
    def available(self) -> bool:
        """Офлайн-движок доступен всегда."""
        return True

    # ------------------------------------------------------------ вопросы
    def generate_questions(
        self,
        *,
        role: str,
        level: str,
        mode: str,
        count: int,
        focus_topics: list[str] | None = None,
        resume_text: str | None = None,
        exclude: list[str] | None = None,
    ) -> list[GeneratedQuestion]:
        """Подбирает вопросы из встроенного банка (детерминированно)."""
        total = max(0, int(count))
        if total == 0:
            return []
        bank = pick_questions(
            role=role,
            level=level,
            mode=mode,
            count=total,
            focus_topics=focus_topics,
            exclude=exclude,
        )
        if mode in ("mixed", "code") and not any(
            item.get("type") == "code" for item in bank
        ):
            code_pool = pick_questions(
                role=role,
                level=level,
                mode="code",
                count=total,
                focus_topics=focus_topics,
                exclude=exclude,
            )
            code_item = next(
                (item for item in code_pool if item.get("type") == "code"), None
            )
            if code_item is not None:
                if bank:
                    bank[-1] = code_item
                else:
                    bank.append(code_item)

        questions = [self._to_generated(item) for item in bank]
        used = {question.text.strip().lower() for question in questions}
        while len(questions) < total:
            candidate = self._synthetic_question(role=role, level=level, index=len(questions))
            if candidate.text.strip().lower() in used:
                break
            used.add(candidate.text.strip().lower())
            questions.append(candidate)
        return questions[:total]

    def next_question(
        self,
        *,
        role: str,
        level: str,
        mode: str,
        focus_topics: list[str] | None = None,
        weak_topics: list[str] | None = None,
        exclude: list[str] | None = None,
    ) -> GeneratedQuestion:
        """Адаптивный вопрос под слабые темы (из банка или синтетический)."""
        for topics in (weak_topics or focus_topics, focus_topics, None):
            bank = pick_questions(
                role=role,
                level=level,
                mode=mode,
                count=1,
                focus_topics=topics or None,
                exclude=exclude,
            )
            if bank:
                return self._to_generated(bank[0])
        return self._synthetic_question(role=role, level=level, index=0)

    @staticmethod
    def _to_generated(item: dict[str, Any]) -> GeneratedQuestion:
        """Превращает запись банка вопросов в ``GeneratedQuestion``."""
        difficulty = str(item.get("difficulty") or "medium")
        question_type = str(item.get("type") or "theory")
        return GeneratedQuestion(
            text=str(item.get("text") or "").strip(),
            topic=str(item.get("topic") or "Общее"),
            difficulty=difficulty if difficulty in DIFFICULTIES else "medium",
            type=question_type if question_type in QUESTION_TYPES else "theory",
            expected_points=[
                str(point).strip()
                for point in (item.get("expected_points") or [])
                if str(point).strip()
            ],
            starter_code=item.get("starter_code"),
            language=item.get("language"),
        )

    @staticmethod
    def _synthetic_question(*, role: str, level: str, index: int) -> GeneratedQuestion:
        """Синтетический вопрос по темам роли, если банк исчерпан."""
        topics = role_topics(role) or ["Общее"]
        templates = (
            "Объясните ключевые понятия темы «{topic}» и приведите практический пример.",
            "Какие типичные ошибки допускают в теме «{topic}» и как их избежать?",
            "Как знания по теме «{topic}» применяются в реальной работе? Приведите пример.",
        )
        total = len(topics) * len(templates)
        slot = max(0, index) % total
        topic = topics[slot % len(topics)]
        template = templates[(slot // len(topics)) % len(templates)]
        return GeneratedQuestion(
            text=template.format(topic=topic),
            topic=topic,
            difficulty=LEVEL_DIFFICULTY.get(level, "medium"),
            type="theory",
            expected_points=[
                f"Определение и основные понятия темы «{topic}»",
                "Механизм работы и важные детали",
                "Практический пример применения",
                "Типичные ошибки и ограничения",
            ],
        )

    # ------------------------------------------------------------- оценка
    def evaluate_answer(
        self,
        *,
        question: dict[str, Any],
        answer_text: str,
        role: str,
        level: str,
    ) -> EvaluationResult:
        """Эвристическая оценка ответа по четырём критериям."""
        result, _details = _evaluate_text(
            question=question, answer_text=answer_text, level=level
        )
        return result

    def build_report(
        self,
        *,
        items: list[dict[str, Any]],
        role: str,
        level: str,
        duration_sec: int,
    ) -> SessionReportData:
        """Итоговый отчёт по сессии на основе оценок ответов."""
        scored: list[tuple[str, float]] = []
        strengths: list[str] = []
        gaps: list[str] = []
        for item in items or []:
            question = item.get("question") if isinstance(item.get("question"), dict) else {}
            evaluation = item.get("evaluation") if isinstance(item.get("evaluation"), dict) else {}
            topic = str(question.get("topic") or "Общее")
            score = _clamp(evaluation.get("score", 0.0))
            scored.append((topic, score))
            strengths.extend(_unique_strings(evaluation.get("strengths"), limit=2))
            gaps.extend(_unique_strings(evaluation.get("gaps"), limit=2))

        scores = [score for _, score in scored]
        overall = round(sum(scores) / len(scores), 1) if scores else 0.0

        topic_values: dict[str, list[float]] = {}
        for topic, score in scored:
            topic_values.setdefault(topic, []).append(score)
        topic_scores = {
            topic: round(sum(values) / len(values), 1)
            for topic, values in topic_values.items()
        }
        weak = sorted(topic_scores.items(), key=lambda pair: (pair[1], pair[0]))
        strong = sorted(topic_scores.items(), key=lambda pair: (-pair[1], pair[0]))

        unique_strengths = _unique_strings(strengths, limit=6)
        for topic, value in strong:
            if value >= 7.0 and len(unique_strengths) < 6:
                unique_strengths.append(f"Уверенные ответы по теме «{topic}» (средний балл {value}).")
        if not unique_strengths:
            unique_strengths = ["Ответы даны по существу — база для роста есть."]

        unique_gaps = _unique_strings(gaps, limit=6)
        for topic, value in weak:
            if value < 6.5 and len(unique_gaps) < 6:
                unique_gaps.append(f"Тема «{topic}» требует повторения (средний балл {value}).")
        if not unique_gaps:
            unique_gaps = ["Углубите ответы: ограничения, компромиссы и граничные случаи."]

        recommendations: list[str] = []
        for topic, value in weak:
            if value < 6.5 and len(recommendations) < 4:
                recommendations.append(
                    f"Повторите тему «{topic}» (средний балл {value} из 10): "
                    "определения, механизм работы и практический пример."
                )
        if overall >= 8.0:
            recommendations.append(
                "Поддерживайте форму: 2–3 тренировочных собеседования в неделю и разбор эталонных ответов."
            )
        elif overall >= 6.0:
            recommendations.append(
                "Закрепите сильные темы и добавьте по одному вопросу повышенной сложности на слабые темы."
            )
        else:
            recommendations.append(
                "Составьте план подготовки: 2–3 темы в неделю, ответы вслух и самопроверка по эталону."
            )
        if not recommendations:
            recommendations = ["Продолжайте тренироваться: 2–3 собеседования в неделю."]

        if overall >= 8.0:
            verdict = "Отличный уровень: ответы уверенные, полные и структурированные."
        elif overall >= 6.5:
            verdict = "Хороший уровень: база есть, отдельные темы нужно углубить."
        elif overall >= 4.5:
            verdict = "Базовый уровень: заметные пробелы, требуется системная подготовка."
        elif overall > 0:
            verdict = "Начальный уровень: начните с основ теории по слабым темам."
        else:
            verdict = "Оценок пока нет: ответьте хотя бы на один вопрос."

        if scored:
            verdict += f" Отвечено вопросов: {len(scored)}, длительность {max(0, int(duration_sec))} с."

        return SessionReportData(
            overall_score=overall,
            verdict=verdict,
            strengths=unique_strengths[:6],
            gaps=unique_gaps[:6],
            recommendations=recommendations[:5],
            topic_scores=topic_scores,
        )

    # --------------------------------------------------------------- код
    def generate_code_task(
        self,
        *,
        topic: str | None,
        language: str,
        difficulty: str,
        role: str,
        level: str,
    ) -> CodeTaskData:
        """Детерминированная задача с кодом (из банка или шаблона)."""
        normalized_language = (language or "python").strip().lower()
        normalized_difficulty = difficulty if difficulty in DIFFICULTIES else "medium"
        task = pick_code_task(
            topic=topic, language=normalized_language, difficulty=normalized_difficulty
        )
        task_language = str(task.get("language") or "python")
        same_language = task_language == normalized_language
        same_difficulty = str(task.get("difficulty") or "medium") == normalized_difficulty
        if same_language and same_difficulty:
            return CodeTaskData(
                title=str(task.get("title") or "Практическая задача"),
                description=str(task.get("description") or ""),
                topic=str(task.get("topic") or topic or "Алгоритмы и структуры данных"),
                language=task_language,
                difficulty=normalized_difficulty,
                starter_code=str(task.get("starter_code") or ""),
                hints=_unique_strings(task.get("hints"), limit=4)
                or ["Разбейте задачу на шаги и проверьте крайние случаи."],
            )
        return self._template_code_task(
            topic=topic,
            language=normalized_language,
            difficulty=normalized_difficulty,
            level=level,
        )

    @staticmethod
    def _template_code_task(
        *,
        topic: str | None,
        language: str,
        difficulty: str,
        level: str,
    ) -> CodeTaskData:
        """Шаблон задачи под запрошенные язык и сложность."""
        if language == "sql":
            description = _SQL_DESCRIPTION_BY_DIFFICULTY.get(
                difficulty, _SQL_TASK_DESCRIPTION
            )
            return CodeTaskData(
                title="Агрегация заказов в SQL",
                description=description,
                topic=topic or "Базы данных и SQL",
                language="sql",
                difficulty=difficulty,
                starter_code=_starter_for_language("sql"),
                hints=[
                    "Начните с FROM и JOIN нужных таблиц.",
                    "Подумайте, где фильтровать по дате — до или после агрегации.",
                    "Проверьте группы, в которых нет заказов (LEFT JOIN + COALESCE).",
                ],
            )
        extra = {
            "easy": "Достаточно одного прохода по данным.",
            "medium": "Постарайтесь уложиться в O(n log n), лучше — в O(n).",
            "hard": "Требуется O(n) без полной сортировки и без лишней памяти.",
        }.get(difficulty, "")
        description = (
            "Дан массив целых чисел nums. Верните второй по величине уникальный элемент "
            "или None/null, если такого элемента нет.\n\n"
            "Пример: [3, 1, 4, 4, 2] → 3; [1] → None; [] → None.\n\n"
            f"Дополнительно: {extra} Уровень кандидата: {level}."
        )
        return CodeTaskData(
            title="Второй по величине уникальный элемент",
            description=description,
            topic=topic or "Алгоритмы и структуры данных",
            language=language,
            difficulty=difficulty,
            starter_code=_starter_for_language(language),
            hints=[
                "Сначала избавьтесь от дублей.",
                "Проверьте пустой массив и массив из одного элемента.",
                "Достаточно хранить два максимума — полная сортировка не обязательна.",
            ],
        )

    def review_code(
        self,
        *,
        task: dict[str, Any] | None,
        code: str,
        language: str,
        topic: str | None = None,
    ) -> CodeReviewData:
        """Статическое код-ревью по эвристикам (без выполнения кода)."""
        source = code or ""
        normalized_language = (language or "python").strip().lower()
        title = None
        if isinstance(task, dict):
            title = task.get("title")
        stripped = source.strip()
        if not stripped:
            return CodeReviewData(
                score=0.0,
                verdict="Решение пустое: код не отправлен.",
                correctness_notes="Разбирать нечего — пришлите код решения.",
                issues=[
                    CodeIssueData(
                        severity="critical",
                        title="Пустой ответ",
                        detail="Пришлите код решения задачи.",
                    )
                ],
                improved_code=_starter_for_language(normalized_language),
                time_complexity="—",
                space_complexity="—",
            )

        issues: list[CodeIssueData] = []
        notes: list[str] = []
        score = 7.0
        lines = source.splitlines()
        code_lines = [
            line
            for line in lines
            if line.strip()
            and not line.strip().startswith(("#", "//", "--", "/*", "*", "*/"))
        ]
        lower = _normalize(source)

        # 1. Незавершённые заглушки.
        if re.search(r"\b(TODO|FIXME|XXX)\b", source, re.IGNORECASE):
            issues.append(
                CodeIssueData(
                    severity="major",
                    title="Незавершённый код (TODO/FIXME)",
                    detail="В решении остались заглушки — реализуйте отмеченные участки.",
                )
            )
            score -= 2.0
            notes.append("есть незавершённые участки")
        if re.search(r"\braise\s+NotImplementedError\b", source):
            issues.append(
                CodeIssueData(
                    severity="critical",
                    title="Решение не реализовано",
                    detail="Вместо логики выбрасывается NotImplementedError.",
                )
            )
            score -= 4.0
            notes.append("функция не реализована")

        # 2. pass / ... вместо тела функции (Python).
        if normalized_language == "python":
            body = _function_body_lines(source)
            if body is not None:
                meaningful = [
                    line.strip()
                    for _, line in body
                    if line.strip()
                    and not line.strip().startswith("#")
                    and not line.strip().startswith('"""')
                    and not line.strip().startswith("'''")
                ]
                if meaningful and all(
                    re.fullmatch(r"(pass|\.\.\.)", line) for line in meaningful
                ):
                    issues.append(
                        CodeIssueData(
                            severity="critical",
                            title="Функция не реализована",
                            detail="Тело функции содержит только pass/... — решения по сути нет.",
                        )
                    )
                    score -= 5.0
                    notes.append("функция не реализована (pass/...)")
            if re.search(r"(?m)^\s+pass\s*$", source) and not any(
                "не реализована" in note for note in notes
            ):
                issues.append(
                    CodeIssueData(
                        severity="major",
                        title="Заглушка pass в коде",
                        detail="Проверьте, что все ветки с pass действительно реализованы.",
                    )
                )
                score -= 1.5

        # 3. Обработка исключений.
        if re.search(r"except\s*:", source):
            issues.append(
                CodeIssueData(
                    severity="major",
                    title="Перехват всех исключений",
                    detail="`except:` ловит и системные исключения — укажите конкретные типы.",
                )
            )
            score -= 0.8
        if re.search(r"(?s)except\s+Exception[^:]*:\s*\n\s*(pass|\.\.\.)", source):
            issues.append(
                CodeIssueData(
                    severity="major",
                    title="Исключение проглатывается",
                    detail="Ошибка перехватывается и игнорируется — добавьте логирование или обработку.",
                )
            )
            score -= 1.0
            notes.append("исключения глушатся")

        # 4. Отладочный вывод.
        if re.search(r"\bprint\s*\(", source) and normalized_language == "python":
            issues.append(
                CodeIssueData(
                    severity="nit",
                    title="Отладочный print",
                    detail="Уберите print из решения или замените логированием.",
                )
            )
            score -= 0.3

        # 5. Размер и вложенность.
        if len(code_lines) > 40:
            issues.append(
                CodeIssueData(
                    severity="major",
                    title=f"Слишком длинное решение ({len(code_lines)} строк)",
                    detail="Выделите вспомогательные функции — так код проще читать и тестировать.",
                )
            )
            score -= 1.0
        elif len(code_lines) > 25:
            issues.append(
                CodeIssueData(
                    severity="minor",
                    title=f"Длинное решение ({len(code_lines)} строк)",
                    detail="Проверьте, можно ли разбить логику на небольшие функции.",
                )
            )
            score -= 0.4

        if normalized_language == "python":
            depth = _python_loop_depth(source)
        else:
            depth = _generic_loop_depth(source, normalized_language)
        if depth >= 3:
            issues.append(
                CodeIssueData(
                    severity="major",
                    title="Глубокая вложенность циклов",
                    detail="Три уровня циклов дают кубическую сложность — почти наверняка можно упростить.",
                )
            )
            score -= 1.5
        elif depth == 2:
            issues.append(
                CodeIssueData(
                    severity="major",
                    title="Вложенные циклы (потенциально O(n²))",
                    detail="Проверьте, можно ли заменить вложенный поиск хеш-таблицей и получить O(n).",
                )
            )
            score -= 1.0
            notes.append("вложенные циклы")

        # 6. Крайние случаи.
        edge_handled = _has_edge_handling(source, normalized_language)
        if not edge_handled:
            issues.append(
                CodeIssueData(
                    severity="major",
                    title="Не обработаны крайние случаи",
                    detail="Добавьте проверку пустого входа, None/null и граничных значений.",
                )
            )
            score -= 1.5
            notes.append("нет проверки крайних случаев")
        else:
            notes.append("есть проверка крайних случаев")

        # 7. Возврат результата.
        if normalized_language == "python" and not re.search(r"\b(return|yield)\b", source):
            issues.append(
                CodeIssueData(
                    severity="critical",
                    title="Функция не возвращает результат",
                    detail="Добавьте return — сейчас функция ничего не отдаёт.",
                )
            )
            score -= 2.0
            notes.append("нет return")

        # 8. Читаемость: комментарии, имена, длинные строки.
        if len(code_lines) >= 3 and not re.search(r'("""|\'\'\'|^\s*#|//|--)', source, re.MULTILINE):
            issues.append(
                CodeIssueData(
                    severity="nit",
                    title="Нет комментариев или docstring",
                    detail="Кратко опишите контракт функции и неочевидные шаги.",
                )
            )
            score -= 0.3
        short_vars = set(re.findall(r"(?<![\w.])[a-h]\s*=", source)) - {"i", "j", "k"}
        if len(short_vars) >= 2:
            issues.append(
                CodeIssueData(
                    severity="minor",
                    title="Непонятные имена переменных",
                    detail="Используйте осмысленные имена: они делают логику самодокументируемой.",
                )
            )
            score -= 0.4
        if any(len(line) > 120 for line in lines):
            issues.append(
                CodeIssueData(
                    severity="nit",
                    title="Слишком длинные строки",
                    detail="Разбейте длинные выражения на несколько строк для читаемости.",
                )
            )
            score -= 0.2

        # 9. Простые проверки для SQL.
        if normalized_language == "sql":
            if re.search(r"select\s+\*", lower):
                issues.append(
                    CodeIssueData(
                        severity="minor",
                        title="SELECT *",
                        detail="Перечисляйте нужные колонки явно — это стабильнее и быстрее.",
                    )
                )
                score -= 0.4
            if "left join" in lower and re.search(
                r"where\s+[^;]*\b[a-z_]+\.\w+\s*(?:=|>|<)", lower
            ):
                notes.append("проверьте фильтр правой таблицы LEFT JOIN (перенос в ON)")

        # 10. Баланс скобок — грубая проверка синтаксиса.
        if not _brackets_balanced(source):
            issues.append(
                CodeIssueData(
                    severity="critical",
                    title="Несбалансированные скобки",
                    detail="В коде не хватает закрывающей скобки — вероятна синтаксическая ошибка.",
                )
            )
            score -= 3.0
            notes.append("несбалансированные скобки")

        score = _clamp(score)
        if score >= 8.5:
            verdict = "Отличное решение: логика ясная, крайние случаи и сложность под контролем."
        elif score >= 6.5:
            verdict = "Рабочее решение, но есть замечания — их стоит исправить до финального ответа."
        elif score >= 4.0:
            verdict = "Решение частичное: основная идея верна, но есть заметные проблемы."
        else:
            verdict = "Решение пока не готово: исправьте критические замечания и повторите."

        details = notes[:6]
        correctness_notes = (
            "Оценка статическая, без запуска кода. "
            f"Строк кода: {len(code_lines)}. "
            + (
                "Критических проблем не найдено. "
                if not any(issue.severity == "critical" for issue in issues)
                else "Есть критические замечания — решение может не работать. "
            )
            + ("Замечено: " + "; ".join(details) + "." if details else "")
        )
        time_complexity, space_complexity = _infer_complexity(source, depth)

        return CodeReviewData(
            score=score,
            verdict=verdict,
            correctness_notes=correctness_notes,
            issues=issues[:10],
            improved_code=_improved_code(source, normalized_language, title),
            time_complexity=time_complexity,
            space_complexity=space_complexity,
        )

    # --------------------------------------------------------------- чат
    def chat(self, *, messages: list[dict[str, str]], context: str | None = None) -> str:
        """Ответ ассистента целиком по базе знаний."""
        query = ""
        if messages:
            query = str(messages[-1].get("content") or "")
        return _chat_answer(query, context)

    def chat_stream(
        self, *, messages: list[dict[str, str]], context: str | None = None
    ) -> Iterator[str]:
        """Потоковая выдача ответа по предложениям."""
        answer = self.chat(messages=messages, context=context)
        yield from _split_for_stream(answer)

    # --------------------------------------------------------- служебное
    def transcribe(self, *, audio: bytes, filename: str) -> str | None:
        """Офлайн-движок не умеет распознавать речь."""
        return None

    def health(self) -> AIHealthInfo:
        """Состояние офлайн-движка (всегда доступен)."""
        return AIHealthInfo(
            provider="offline",
            model="offline-demo",
            mode="offline",
            available=True,
            message=(
                "Офлайн-демо-движок: работает без ключа API и интернета "
                "(эвристики и встроенная база знаний)."
            ),
        )


def _brackets_balanced(source: str) -> bool:
    """Грубая проверка баланса скобок вне строковых литералов."""
    pairs = {"(": ")", "[": "]", "{": "}"}
    stack: list[str] = []
    in_single = False
    in_double = False
    escaped = False
    for char in source:
        if escaped:
            escaped = False
            continue
        if char == "\\":
            escaped = True
            continue
        if in_single:
            if char == "'":
                in_single = False
            continue
        if in_double:
            if char == '"':
                in_double = False
            continue
        if char == "'":
            in_single = True
        elif char == '"':
            in_double = True
        elif char in pairs:
            stack.append(pairs[char])
        elif char in pairs.values():
            if not stack or stack.pop() != char:
                return False
    return not stack

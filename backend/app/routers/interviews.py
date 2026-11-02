"""Сессии собеседований: создание, ответы, ИИ-оценка, отчёт."""
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.ai.base import GeneratedQuestion, SessionReportData
from app.ai.factory import get_ai_service
from app.data.catalog import LEVEL_DIFFICULTY, normalize_level, normalize_role
from app.data.question_bank import pick_questions
from app.db import get_db
from app.deps import get_current_user
from app.models import Answer, Evaluation, InterviewSession, Question, User, utcnow
from app.schemas import (
    AnswerIn,
    AnswerOut,
    AnswerResult,
    EvaluationOut,
    InterviewCreate,
    QuestionOut,
    SessionDetail,
    SessionListOut,
    SessionReport,
    SessionSummary,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/interviews", tags=["interviews"])


# ------------------------------------------------------------------ помощники
def _get_session(db: Session, user: User, session_id: int) -> InterviewSession:
    session = db.scalar(
        select(InterviewSession).where(
            InterviewSession.id == session_id, InterviewSession.user_id == user.id
        )
    )
    if session is None:
        raise HTTPException(status_code=404, detail="Собеседование не найдено")
    return session


def _summary(session: InterviewSession) -> SessionSummary:
    return SessionSummary(
        id=session.id,
        role=session.role,
        level=session.level,
        mode=session.mode,
        status=session.status,
        overall_score=session.overall_score,
        question_count=len(session.questions) or session.question_count,
        answered_count=len(session.answers),
        started_at=session.started_at,
        finished_at=session.finished_at,
        duration_sec=session.duration_sec,
    )


def _detail(session: InterviewSession) -> SessionDetail:
    answer_map: dict[int, AnswerResult] = {}
    for answer in session.answers:
        if answer.evaluation is None:
            continue
        answer_map[answer.question_id] = AnswerResult(
            answer=AnswerOut.model_validate(answer),
            evaluation=EvaluationOut.model_validate(answer.evaluation),
        )
    report = SessionReport(**session.report) if session.report else None
    return SessionDetail(
        **_summary(session).model_dump(),
        questions=[QuestionOut.model_validate(question) for question in session.questions],
        answers=[answer_map[q.id] for q in session.questions if q.id in answer_map],
        report=report,
    )


def _question_payload(question: Question) -> dict:
    return {
        "id": question.id,
        "text": question.text,
        "topic": question.topic,
        "difficulty": question.difficulty,
        "type": question.type,
        "expected_points": list(question.expected_points or []),
        "starter_code": question.starter_code,
        "language": question.language,
    }


def _local_report(items: list[dict], duration_sec: int) -> SessionReportData:
    """Детерминированный запасной расчёт отчёта, если ИИ недоступен."""
    scores = [float(item["evaluation"].get("score", 0.0)) for item in items]
    overall = round(sum(scores) / len(scores), 1) if scores else 0.0
    topic_scores: dict[str, list[float]] = {}
    for item in items:
        topic = item["question"].get("topic") or "Общее"
        topic_scores.setdefault(topic, []).append(float(item["evaluation"].get("score", 0.0)))
    averaged = {topic: round(sum(values) / len(values), 1) for topic, values in topic_scores.items()}
    weak = sorted(averaged.items(), key=lambda pair: pair[1])[:3]
    strong = sorted(averaged.items(), key=lambda pair: pair[1], reverse=True)[:3]
    gaps = list(dict.fromkeys([gap for item in items for gap in item["evaluation"].get("gaps", [])]))[:6]
    strengths = list(
        dict.fromkeys([pro for item in items for pro in item["evaluation"].get("strengths", [])])
    )[:6]
    if overall >= 8:
        verdict = "Отличный уровень: ответы уверенные и полные."
    elif overall >= 6:
        verdict = "Хороший уровень: база есть, нужно углубить отдельные темы."
    elif overall >= 4:
        verdict = "Базовый уровень: есть заметные пробелы, требуется подготовка."
    else:
        verdict = "Начальный уровень: начните с основ теории по слабым темам."
    recommendations = [
        f"Повторите тему «{topic}» (средний балл {value})." for topic, value in weak
    ] or ["Продолжайте тренироваться: 2–3 собеседования в неделю."]
    return SessionReportData(
        overall_score=overall,
        verdict=verdict,
        strengths=strengths or [f"Сильная тема: {topic}" for topic, _ in strong],
        gaps=gaps,
        recommendations=recommendations,
        topic_scores=averaged,
    )


def _fallback_questions(
    *, role: str, level: str, mode: str, count: int, focus_topics: list[str] | None,
    exclude: list[str],
) -> list[GeneratedQuestion]:
    bank = pick_questions(
        role=role,
        level=level,
        mode=mode,
        count=count,
        focus_topics=focus_topics,
        exclude=exclude,
    )
    questions: list[GeneratedQuestion] = []
    for item in bank:
        questions.append(
            GeneratedQuestion(
                text=item["text"],
                topic=item.get("topic", "Общее"),
                difficulty=item.get("difficulty", LEVEL_DIFFICULTY.get(level, "medium")),
                type=item.get("type", "theory"),
                expected_points=item.get("expected_points", []),
                starter_code=item.get("starter_code"),
                language=item.get("language"),
            )
        )
    return questions


# ------------------------------------------------------------------ сессии
@router.post(
    "",
    response_model=SessionDetail,
    status_code=status.HTTP_201_CREATED,
    summary="Начать собеседование",
)
def create_interview(
    payload: InterviewCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SessionDetail:
    role = normalize_role(payload.role)
    level = normalize_level(payload.level)
    focus_topics = [topic.strip() for topic in payload.focus_topics if topic.strip()][:5]

    generated: list[GeneratedQuestion] = []
    source = "ai"
    try:
        generated = get_ai_service().generate_questions(
            role=role,
            level=level,
            mode=payload.mode,
            count=payload.question_count,
            focus_topics=focus_topics or None,
            resume_text=user.resume_text,
        )
    except Exception as exc:  # ИИ недоступен — используем встроенный банк вопросов
        logger.warning("Генерация вопросов ИИ недоступна, использую банк: %s", exc)
        generated = []

    generated = [question for question in generated if question.text.strip()]
    if len(generated) < payload.question_count:
        missing = payload.question_count - len(generated)
        generated.extend(
            _fallback_questions(
                role=role,
                level=level,
                mode=payload.mode,
                count=missing,
                focus_topics=focus_topics or None,
                exclude=[question.text for question in generated],
            )
        )
    generated = generated[: payload.question_count]
    if not generated:
        raise HTTPException(status_code=503, detail="Не удалось подготовить вопросы собеседования")
    if len(generated) < payload.question_count:
        source = "bank"

    session = InterviewSession(
        user_id=user.id,
        role=role,
        level=level,
        mode=payload.mode,
        question_count=len(generated),
        status="in_progress",
    )
    db.add(session)
    db.flush()
    for index, item in enumerate(generated):
        db.add(
            Question(
                session_id=session.id,
                order_index=index,
                type=item.type,
                topic=item.topic,
                difficulty=item.difficulty,
                text=item.text,
                expected_points=list(item.expected_points),
                starter_code=item.starter_code,
                language=item.language,
                source=source,
            )
        )
    db.commit()
    db.refresh(session)
    return _detail(session)


@router.get("", response_model=SessionListOut, summary="История собеседований")
def list_interviews(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SessionListOut:
    total = db.scalar(
        select(func.count()).select_from(InterviewSession).where(InterviewSession.user_id == user.id)
    ) or 0
    sessions = db.scalars(
        select(InterviewSession)
        .where(InterviewSession.user_id == user.id)
        .order_by(InterviewSession.started_at.desc(), InterviewSession.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return SessionListOut(items=[_summary(session) for session in sessions], total=int(total))


@router.get("/{session_id}", response_model=SessionDetail, summary="Детали собеседования")
def get_interview(
    session_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SessionDetail:
    return _detail(_get_session(db, user, session_id))


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Удалить сессию")
def delete_interview(
    session_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    session = _get_session(db, user, session_id)
    db.delete(session)
    db.commit()


@router.post(
    "/{session_id}/answers",
    response_model=AnswerResult,
    summary="Ответить на вопрос (с ИИ-оценкой)",
)
def submit_answer(
    session_id: int,
    payload: AnswerIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AnswerResult:
    session = _get_session(db, user, session_id)
    if session.status != "in_progress":
        raise HTTPException(status_code=400, detail="Собеседование уже завершено")
    question = next((item for item in session.questions if item.id == payload.question_id), None)
    if question is None:
        raise HTTPException(status_code=400, detail="Вопрос не относится к этому собеседованию")
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Ответ не может быть пустым")

    answer = question.answer
    if answer is None:
        answer = Answer(
            question_id=question.id,
            session_id=session.id,
            user_id=user.id,
            text=text,
            time_spent_sec=payload.time_spent_sec,
        )
        db.add(answer)
    else:
        answer.text = text
        answer.time_spent_sec = payload.time_spent_sec
    db.flush()

    if answer.evaluation is not None:
        db.delete(answer.evaluation)
        db.flush()

    try:
        result = get_ai_service().evaluate_answer(
            question=_question_payload(question),
            answer_text=text,
            role=session.role,
            level=session.level,
        )
    except Exception as exc:
        logger.exception("Ошибка ИИ-оценки")
        raise HTTPException(
            status_code=503, detail=f"ИИ-оценка временно недоступна: {exc}"
        ) from exc

    evaluation = Evaluation(
        answer_id=answer.id,
        question_id=question.id,
        session_id=session.id,
        score=max(0.0, min(10.0, float(result.score))),
        criteria={key: max(0.0, min(10.0, float(value))) for key, value in result.criteria.items()},
        strengths=list(result.strengths),
        gaps=list(result.gaps),
        ideal_answer=result.ideal_answer,
        recommendation=result.recommendation,
        follow_up_question=result.follow_up_question,
    )
    db.add(evaluation)
    session.duration_sec = int((utcnow() - session.started_at).total_seconds())
    db.commit()
    db.refresh(answer)
    db.refresh(evaluation)
    return AnswerResult(
        answer=AnswerOut.model_validate(answer),
        evaluation=EvaluationOut.model_validate(evaluation),
    )


@router.post(
    "/{session_id}/finish",
    response_model=SessionDetail,
    summary="Завершить собеседование и получить отчёт",
)
def finish_interview(
    session_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SessionDetail:
    session = _get_session(db, user, session_id)
    if session.status == "completed":
        return _detail(session)
    answered = [answer for answer in session.answers if answer.evaluation is not None]
    if not answered:
        raise HTTPException(status_code=400, detail="Ответьте хотя бы на один вопрос")

    duration = int((utcnow() - session.started_at).total_seconds())
    items = [
        {
            "question": _question_payload(answer.question),
            "evaluation": {
                "score": answer.evaluation.score,
                "criteria": dict(answer.evaluation.criteria or {}),
                "strengths": list(answer.evaluation.strengths or []),
                "gaps": list(answer.evaluation.gaps or []),
                "recommendation": answer.evaluation.recommendation,
            },
        }
        for answer in answered
    ]
    try:
        report = get_ai_service().build_report(
            items=items, role=session.role, level=session.level, duration_sec=duration
        )
    except Exception as exc:
        logger.warning("ИИ-отчёт недоступен, считаю локально: %s", exc)
        report = _local_report(items, duration)

    report.overall_score = round(max(0.0, min(10.0, float(report.overall_score))), 1)
    stored = report.model_dump()
    stored["answered_count"] = len(answered)
    stored["duration_sec"] = duration

    session.overall_score = report.overall_score
    session.report = stored
    session.status = "completed"
    session.finished_at = utcnow()
    session.duration_sec = duration
    db.commit()
    db.refresh(session)
    return _detail(session)


@router.post(
    "/{session_id}/questions/next",
    response_model=QuestionOut,
    status_code=status.HTTP_201_CREATED,
    summary="Адаптивный дополнительный вопрос",
)
def next_question(
    session_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> QuestionOut:
    session = _get_session(db, user, session_id)
    if session.status != "in_progress":
        raise HTTPException(status_code=400, detail="Собеседование уже завершено")
    if len(session.questions) >= 30:
        raise HTTPException(status_code=400, detail="Достигнут максимум вопросов в сессии")

    weak_topics: list[str] = []
    topic_scores: dict[str, list[float]] = {}
    for answer in session.answers:
        if answer.evaluation is None:
            continue
        topic = answer.question.topic
        topic_scores.setdefault(topic, []).append(answer.evaluation.score)
    weak_topics = [
        topic
        for topic, scores in sorted(topic_scores.items(), key=lambda pair: sum(pair[1]) / len(pair[1]))
        if sum(scores) / len(scores) < 6.5
    ][:3]

    exclude = [question.text for question in session.questions]
    generated: GeneratedQuestion | None = None
    try:
        generated = get_ai_service().next_question(
            role=session.role,
            level=session.level,
            mode=session.mode,
            focus_topics=None,
            weak_topics=weak_topics or None,
            exclude=exclude,
        )
    except Exception as exc:
        logger.warning("Адаптивный вопрос ИИ недоступен: %s", exc)
    if generated is None or not generated.text.strip():
        bank = _fallback_questions(
            role=session.role,
            level=session.level,
            mode=session.mode,
            count=1,
            focus_topics=weak_topics or None,
            exclude=exclude,
        )
        if not bank:
            raise HTTPException(status_code=503, detail="Не удалось подобрать вопрос")
        generated = bank[0]

    question = Question(
        session_id=session.id,
        order_index=len(session.questions),
        type=generated.type,
        topic=generated.topic,
        difficulty=generated.difficulty,
        text=generated.text,
        expected_points=list(generated.expected_points),
        starter_code=generated.starter_code,
        language=generated.language,
        source="ai" if generated else "bank",
    )
    db.add(question)
    session.question_count = len(session.questions) + 1
    db.commit()
    db.refresh(question)
    return QuestionOut.model_validate(question)

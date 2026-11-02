"""Аналитика прогресса: агрегаты по сессиям и оценкам."""
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import Answer, Evaluation, InterviewSession, Question, User
from app.schemas import AnalyticsOut, ScorePoint, SessionSummary, TopicStat

router = APIRouter(prefix="/analytics", tags=["analytics"])


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


def _streak_days(dates: set[date]) -> int:
    if not dates:
        return 0
    today = datetime.now().date()
    cursor = today if today in dates else today - timedelta(days=1)
    if cursor not in dates:
        return 0
    streak = 0
    while cursor in dates:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


@router.get("/overview", response_model=AnalyticsOut, summary="Сводка прогресса")
def overview(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> AnalyticsOut:
    sessions = db.scalars(
        select(InterviewSession)
        .where(InterviewSession.user_id == user.id)
        .order_by(InterviewSession.started_at.desc())
    ).all()
    completed = [session for session in sessions if session.status == "completed" and session.overall_score is not None]
    scores = [float(session.overall_score) for session in completed]

    evaluations = db.execute(
        select(Evaluation.score, Question.topic, Question.difficulty, Answer.created_at)
        .join(Answer, Answer.id == Evaluation.answer_id)
        .join(Question, Question.id == Evaluation.question_id)
        .where(Answer.user_id == user.id)
    ).all()

    topic_scores: dict[str, list[float]] = {}
    difficulty_scores: dict[str, list[float]] = {}
    activity_dates: set[date] = set()
    for score, topic, difficulty, created_at in evaluations:
        topic_scores.setdefault(topic or "Общее", []).append(float(score))
        difficulty_scores.setdefault(difficulty or "medium", []).append(float(score))
        if created_at is not None:
            activity_dates.add(created_at.date())

    topic_stats = [
        TopicStat(
            topic=topic,
            avg_score=round(sum(values) / len(values), 1),
            answers_count=len(values),
        )
        for topic, values in topic_scores.items()
    ]
    topic_stats.sort(key=lambda item: (-item.avg_score, item.topic))
    weak_topics = sorted(
        (item for item in topic_stats if item.avg_score < 6.5),
        key=lambda item: item.avg_score,
    )[:5]
    strong_topics = [item for item in topic_stats if item.avg_score >= 7.0][:5]

    history = [
        ScorePoint(date=session.started_at.date().isoformat(), score=float(session.overall_score))
        for session in sorted(completed, key=lambda item: item.started_at)
    ][-20:]

    return AnalyticsOut(
        sessions_count=len(sessions),
        completed_sessions=len(completed),
        avg_score=round(sum(scores) / len(scores), 1) if scores else 0.0,
        best_score=round(max(scores), 1) if scores else 0.0,
        questions_answered=len(evaluations),
        streak_days=_streak_days(activity_dates),
        weak_topics=weak_topics,
        strong_topics=strong_topics,
        topic_stats=topic_stats,
        difficulty_stats={
            key: round(sum(values) / len(values), 1) for key, values in difficulty_scores.items()
        },
        score_history=history,
        recent_sessions=[_summary(session) for session in sessions[:5]],
    )

from .models import Interview, Question
from .schemas import InterviewOut, InterviewSummary, QuestionOut


def question_out(q: Question, include_answer: bool) -> QuestionOut:
    ans = None
    if include_answer and q.answer:
        a = q.answer
        ans = {"transcript": a.transcript, "skipped": a.skipped, "score": a.score, "evaluation": a.evaluation,
               "has_audio": bool(a.audio_path), "duration_seconds": a.duration_seconds}
    return QuestionOut(id=q.id, position=q.position, category=q.category, topic=q.topic, text=q.text, grounding=q.grounding,
                       followup_of_id=q.followup_of_id, answer=ans)


def interview_out(iv: Interview) -> InterviewOut:
    done = iv.status in ("finished", "scored")
    # Questions stay hidden until they are asked: reveal up to the current one while the interview runs.
    visible = iv.questions if done else iv.questions[: iv.current_index + 1] if iv.status in ("live", "paused") else []
    rec = iv.recordings[0] if iv.recordings else None
    answered = sum(1 for q in iv.questions if q.answer)
    scored = sum(1 for q in iv.questions if q.answer and q.answer.evaluation)
    return InterviewOut(
        id=iv.id, role_title=iv.role_title, duration_minutes=iv.duration_minutes, difficulty=iv.difficulty,
        interview_type=iv.interview_type, language=iv.language, question_count=iv.question_count, status=iv.status,
        current_index=iv.current_index, total_questions=len(iv.questions), elapsed_seconds=iv.elapsed_seconds,
        created_at=iv.created_at, started_at=iv.started_at, finished_at=iv.finished_at, consent_given_at=iv.consent_given_at,
        questions=[question_out(q, include_answer=True) for q in visible], report=iv.report,
        has_recording=bool(rec and rec.size_bytes), recording_bytes=rec.size_bytes if rec else 0, recording_next_chunk=rec.next_chunk if rec else 0,
        scored_answers=scored, answered=answered,
    )


def interview_summary(iv: Interview) -> InterviewSummary:
    r = iv.report or {}
    return InterviewSummary(
        id=iv.id, role_title=iv.role_title, interview_type=iv.interview_type, difficulty=iv.difficulty, language=iv.language,
        status=iv.status, created_at=iv.created_at, answered=sum(1 for q in iv.questions if q.answer),
        total_questions=len(iv.questions), overall=(r.get("scores") or {}).get("overall"),
        readiness=(r.get("readiness") or {}).get("verdict"),
    )

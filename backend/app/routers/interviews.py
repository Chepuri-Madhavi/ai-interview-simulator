import logging
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import SessionLocal, get_db
from ..deps import get_current_user, owned_interview
from ..models import Analysis, Answer, Document, Interview, Question, Recording, User
from ..schemas import AnswerResult, ElapsedIn, InterviewCreate, InterviewOut, InterviewSummary, StartIn
from ..serializers import interview_out, interview_summary, question_out
from ..services import engine, storage, stt
from ..services.llm import LLMError, get_llm
from ..services.pdf_report import build_pdf

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/interviews", tags=["interviews"])
AUDIO_TYPES = {"audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "video/webm"}


def llm_http_error(e: LLMError) -> HTTPException:
    return HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE if e.retryable else status.HTTP_502_BAD_GATEWAY, str(e))


def _candidate(db: Session, iv: Interview) -> tuple[dict | None, list[str]]:
    a = db.get(Analysis, iv.analysis_id)
    if not a:
        return None, []
    return a.result.get("candidate"), a.result.get("comparison", {}).get("missing_skills", [])


@router.post("", response_model=InterviewOut, status_code=201)
def create_interview(body: InterviewCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    analysis = db.get(Analysis, body.analysis_id)
    if not analysis or analysis.user_id != user.id:
        raise HTTPException(404, "Analysis not found. Analyze your resume and job description first.")
    resume, job = db.get(Document, analysis.resume_id), db.get(Document, analysis.job_id)
    jobinfo = analysis.result.get("job", {})
    title = " at ".join(x for x in [jobinfo.get("title"), jobinfo.get("company")] if x) or "AI/ML Engineer"
    iv = Interview(user_id=user.id, analysis_id=analysis.id, role_title=title[:255], duration_minutes=body.duration_minutes,
                   difficulty=body.difficulty, interview_type=body.interview_type, language=body.language,
                   question_count=body.question_count)
    try:
        iv.questions = engine.plan_questions(get_llm(), analysis, resume.text, job.text, iv)
    except LLMError as e:
        raise llm_http_error(e) from e
    db.add(iv)
    db.commit()
    return interview_out(iv)


@router.get("", response_model=list[InterviewSummary])
def list_interviews(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ivs = db.scalars(select(Interview).where(Interview.user_id == user.id).order_by(Interview.created_at.desc()).limit(200)).all()
    return [interview_summary(iv) for iv in ivs]


@router.get("/{interview_id}", response_model=InterviewOut)
def get_interview(interview_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return interview_out(owned_interview(interview_id, user, db))


@router.post("/{interview_id}/start", response_model=InterviewOut)
def start(interview_id: int, body: StartIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    iv = owned_interview(interview_id, user, db)
    if not body.consent:
        raise HTTPException(400, "You must agree to recording before the interview can start.")
    if iv.status in ("finished", "scored"):
        raise HTTPException(409, "This interview has already finished.")
    now = datetime.now(timezone.utc)
    iv.consent_given_at = iv.consent_given_at or now
    iv.started_at = iv.started_at or now
    iv.status = "live"
    db.commit()
    return interview_out(iv)


@router.post("/{interview_id}/pause", response_model=InterviewOut)
def pause(interview_id: int, body: ElapsedIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    iv = owned_interview(interview_id, user, db)
    if iv.status == "live":
        iv.status, iv.elapsed_seconds = "paused", max(iv.elapsed_seconds, body.elapsed_seconds)
        db.commit()
    return interview_out(iv)


@router.post("/{interview_id}/resume", response_model=InterviewOut)
def resume(interview_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    iv = owned_interview(interview_id, user, db)
    if iv.status == "paused":
        iv.status = "live"
        db.commit()
    return interview_out(iv)


def _evaluate_in_background(interview_id: int, question_id: int) -> None:
    db = SessionLocal()
    try:
        iv, q = db.get(Interview, interview_id), db.get(Question, question_id)
        if not iv or not q or not q.answer or q.answer.evaluation is not None:
            return
        candidate, _ = _candidate(db, iv)
        ev = engine.evaluate(get_llm(), iv, q, q.answer, candidate)
        q.answer.evaluation, q.answer.score = ev, ev["score"]
        db.commit()
    except LLMError as e:  # the report step retries anything left unscored
        log.warning("Background evaluation failed for question %s: %s", question_id, e)
    finally:
        db.close()


async def _save_audio(iv: Interview, q: Question, audio: UploadFile | None) -> str | None:
    if audio is None or not audio.filename:
        return None
    ctype = (audio.content_type or "").split(";")[0]
    if ctype not in AUDIO_TYPES:
        raise HTTPException(415, "Unsupported audio format.")
    data = await audio.read(50 * 1024 * 1024 + 1)
    if len(data) > 50 * 1024 * 1024:
        raise HTTPException(413, "The answer recording is too large.")
    path = storage.interview_dir(iv.user_id, iv.id) / f"answer_{q.id}.webm"
    path.write_bytes(data)
    return storage.relative(path)


@router.post("/{interview_id}/transcribe")
async def transcribe(interview_id: int, audio: UploadFile = File(...), user: User = Depends(get_current_user),
                     db: Session = Depends(get_db)):
    """Server-side transcription of an answer clip (only when STT_PROVIDER=faster_whisper)."""
    iv = owned_interview(interview_id, user, db)
    if not stt.server_stt_enabled():
        raise HTTPException(409, "Server transcription is off; the browser transcribes answers.")
    path = storage.interview_dir(iv.user_id, iv.id) / "transcribe_tmp.webm"
    path.write_bytes(await audio.read(50 * 1024 * 1024))
    text = stt.transcribe(path, iv.language)
    path.unlink(missing_ok=True)
    if text is None:
        raise HTTPException(503, "The audio could not be transcribed. Type or correct your answer instead.")
    return {"transcript": text}


@router.post("/{interview_id}/answers", response_model=AnswerResult)
async def submit_answer(
    interview_id: int,
    background: BackgroundTasks,
    question_id: int = Form(...),
    transcript: str = Form(default=""),
    skipped: bool = Form(default=False),
    duration_seconds: int = Form(default=0),
    elapsed_seconds: int = Form(default=0),
    audio: UploadFile | None = File(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    iv = owned_interview(interview_id, user, db)
    if iv.status != "live":
        raise HTTPException(409, "The interview is not running. Resume it first.")
    current = iv.questions[iv.current_index]
    if current.id != question_id:
        raise HTTPException(409, "This is not the current question. Reload the interview.")
    transcript = transcript.strip()[:20000]
    if not skipped and not transcript:
        raise HTTPException(422, "The answer is empty. Answer the question or skip it.")

    ans = Answer(question_id=current.id, transcript="" if skipped else transcript, skipped=skipped,
                 duration_seconds=max(0, duration_seconds), audio_path=await _save_audio(iv, current, audio))
    db.add(ans)
    iv.elapsed_seconds = max(iv.elapsed_seconds, elapsed_seconds)

    acknowledgement = "Okay, let's move on." if skipped else "Thank you."
    can_follow = (not skipped and current.followup_of_id is None and iv.followups_asked < engine.max_followups(iv)
                  and iv.elapsed_seconds < iv.duration_minutes * 60 * 0.85)
    if can_follow:
        try:
            d = engine.decide_followup(get_llm(), iv, current, transcript)
            acknowledgement = d.acknowledgement.strip()[:120] or acknowledgement
            if d.followup and len(d.followup.strip()) > 8:
                nxt = iv.questions[iv.current_index + 1].position if iv.current_index + 1 < len(iv.questions) else current.position + 1
                iv.questions.insert(iv.current_index + 1, Question(
                    position=(current.position + nxt) / 2, category=current.category, topic=current.topic,
                    text=d.followup.strip(), grounding="Follow-up to your previous answer", followup_of_id=current.id))
                iv.followups_asked += 1
        except LLMError as e:  # a follow-up is optional; keep the interview moving
            log.info("Follow-up skipped: %s", e)

    finished = iv.current_index + 1 >= len(iv.questions)
    if finished:
        iv.status, iv.finished_at = "finished", datetime.now(timezone.utc)
    else:
        iv.current_index += 1
    db.commit()
    background.add_task(_evaluate_in_background, iv.id, current.id)
    return AnswerResult(acknowledgement=acknowledgement, finished=finished,
                        next_question=None if finished else question_out(iv.questions[iv.current_index], include_answer=False),
                        current_index=iv.current_index, total_questions=len(iv.questions))


@router.post("/{interview_id}/finish", response_model=InterviewOut)
def finish(interview_id: int, body: ElapsedIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    iv = owned_interview(interview_id, user, db)
    if iv.status in ("ready", "live", "paused"):
        iv.status, iv.finished_at = "finished", datetime.now(timezone.utc)
        iv.elapsed_seconds = max(iv.elapsed_seconds, body.elapsed_seconds)
        db.commit()
    return interview_out(iv)


@router.post("/{interview_id}/report", response_model=InterviewOut)
def generate_report(interview_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Scores any unscored answers, then writes the final report. Can take a minute."""
    iv = owned_interview(interview_id, user, db)
    if iv.status not in ("finished", "scored"):
        raise HTTPException(409, "Finish the interview before generating the report.")
    candidate, missing = _candidate(db, iv)
    llm = get_llm()
    errors = engine.evaluate_pending(db, llm, iv, candidate)
    if errors:
        raise HTTPException(503, f"Some answers could not be scored: {errors[0]} Try again.")
    try:
        iv.report = engine.build_report(llm, iv, missing)
    except LLMError as e:
        raise llm_http_error(e) from e
    iv.status = "scored"
    db.commit()
    return interview_out(iv)


@router.get("/{interview_id}/report.pdf")
def report_pdf(interview_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    iv = owned_interview(interview_id, user, db)
    if not iv.report:
        raise HTTPException(404, "Generate the report first.")
    return Response(build_pdf(iv), media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="interview-report-{iv.id}.pdf"'})


@router.delete("/{interview_id}", status_code=204)
def delete_interview(interview_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    iv = owned_interview(interview_id, user, db)
    db.delete(iv)
    db.commit()
    storage.delete_interview_files(user.id, interview_id)


@router.get("/{interview_id}/answers/{question_id}/audio")
def answer_audio(interview_id: int, question_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    iv = owned_interview(interview_id, user, db)
    q = db.get(Question, question_id)
    if not q or q.interview_id != iv.id or not q.answer or not q.answer.audio_path:
        raise HTTPException(404, "No audio for this answer.")
    return FileResponse(storage.resolve(q.answer.audio_path), media_type="audio/webm")


# ---- full-session recording (audio + video), uploaded in ordered chunks while the interview runs ----

def _recording(db: Session, iv: Interview, create: bool) -> Recording | None:
    rec = iv.recordings[0] if iv.recordings else None
    if rec is None and create:
        path = storage.interview_dir(iv.user_id, iv.id) / "recording.webm"
        rec = Recording(interview_id=iv.id, path=storage.relative(path))
        db.add(rec)
        db.flush()
    return rec


@router.post("/{interview_id}/recording/chunks")
async def upload_chunk(interview_id: int, index: int, chunk: UploadFile = File(...), user: User = Depends(get_current_user),
                       db: Session = Depends(get_db)):
    iv = owned_interview(interview_id, user, db)
    if not iv.consent_given_at:
        raise HTTPException(403, "Recording consent has not been given for this interview.")
    rec = _recording(db, iv, create=True)
    if rec.complete:
        raise HTTPException(409, "The recording is already complete.")
    if index < rec.next_chunk:  # duplicate retry of a chunk we already stored
        return {"next_chunk": rec.next_chunk, "size_bytes": rec.size_bytes}
    if index > rec.next_chunk:
        raise HTTPException(409, f"Expected chunk {rec.next_chunk}.")
    data = await chunk.read(20 * 1024 * 1024 + 1)
    limit = get_settings().max_recording_mb * 1024 * 1024
    if rec.size_bytes + len(data) > limit:
        raise HTTPException(413, "The recording reached the size limit.")
    with storage.resolve(rec.path).open("ab") as f:
        f.write(data)
    rec.size_bytes += len(data)
    rec.next_chunk += 1
    rec.mime_type = (chunk.content_type or "video/webm").split(";")[0]
    db.commit()
    return {"next_chunk": rec.next_chunk, "size_bytes": rec.size_bytes}


@router.post("/{interview_id}/recording/complete")
def complete_recording(interview_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    iv = owned_interview(interview_id, user, db)
    rec = _recording(db, iv, create=False)
    if not rec:
        raise HTTPException(404, "No recording was uploaded.")
    rec.complete = True
    db.commit()
    return {"size_bytes": rec.size_bytes}


@router.get("/{interview_id}/recording")
def get_recording(interview_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    iv = owned_interview(interview_id, user, db)
    rec = _recording(db, iv, create=False)
    if not rec or not rec.size_bytes:
        raise HTTPException(404, "No recording for this interview.")
    return FileResponse(storage.resolve(rec.path), media_type=rec.mime_type, filename=f"interview-{iv.id}.webm")


@router.delete("/{interview_id}/recording", status_code=204)
def delete_recording(interview_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Deletes the session video and every answer audio clip; transcripts and scores stay."""
    iv = owned_interview(interview_id, user, db)
    for rec in list(iv.recordings):
        storage.resolve(rec.path).unlink(missing_ok=True)
        db.delete(rec)
    for q in iv.questions:
        if q.answer and q.answer.audio_path:
            storage.resolve(q.answer.audio_path).unlink(missing_ok=True)
            q.answer.audio_path = None
    db.commit()

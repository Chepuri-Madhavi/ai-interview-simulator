from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..deps import get_current_user
from ..models import Analysis, Document, User
from ..schemas import AnalysisIn, AnalysisOut, DocumentOut
from ..services import engine
from ..services.extraction import ExtractionError, extract_text, validate_pasted_text
from ..services.llm import LLMError, get_llm

router = APIRouter(prefix="/api", tags=["documents"])
SAMPLES = Path(__file__).resolve().parents[3] / "samples"


@router.post("/documents", response_model=DocumentOut, status_code=201)
async def upload_document(
    kind: Literal["resume", "job"] = Form(...),
    file: UploadFile | None = File(default=None),
    text: str | None = Form(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload a PDF/DOCX file, or send pasted text in `text`."""
    s = get_settings()
    try:
        if file is not None and file.filename:
            data = await file.read(s.max_upload_mb * 1024 * 1024 + 1)
            content = extract_text(file.filename, data, s.max_upload_mb * 1024 * 1024)
            name = Path(file.filename).name[:255]
        elif text:
            content, name = validate_pasted_text(text), "Pasted text"
        else:
            raise ExtractionError("Upload a PDF or DOCX file, or paste the text.")
    except ExtractionError as e:
        raise HTTPException(422, str(e)) from e
    doc = Document(user_id=user.id, kind=kind, filename=name, text=content)
    db.add(doc)
    db.commit()
    return doc


@router.get("/documents", response_model=list[DocumentOut])
def list_documents(kind: str | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = select(Document).where(Document.user_id == user.id).order_by(Document.created_at.desc())
    if kind:
        q = q.where(Document.kind == kind)
    return db.scalars(q.limit(50)).all()


@router.delete("/documents/{doc_id}", status_code=204)
def delete_document(doc_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    doc = db.get(Document, doc_id)
    if not doc or doc.user_id != user.id:
        raise HTTPException(404, "Document not found.")
    db.delete(doc)
    db.commit()


@router.get("/samples")
def samples():
    """Fictional sample resume and job description for trying the app."""
    return {
        "resume": (SAMPLES / "sample_resume.txt").read_text(encoding="utf-8"),
        "job": (SAMPLES / "sample_job_description.txt").read_text(encoding="utf-8"),
    }


def _owned_doc(db: Session, doc_id: int, user: User, kind: str) -> Document:
    doc = db.get(Document, doc_id)
    if not doc or doc.user_id != user.id or doc.kind != kind:
        raise HTTPException(404, f"{'Resume' if kind == 'resume' else 'Job description'} not found.")
    return doc


@router.post("/analyses", response_model=AnalysisOut, status_code=201)
def create_analysis(body: AnalysisIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    resume = _owned_doc(db, body.resume_id, user, "resume")
    job = _owned_doc(db, body.job_id, user, "job")
    try:
        result = engine.analyze(get_llm(), resume.text, job.text)
    except LLMError as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE if e.retryable else status.HTTP_502_BAD_GATEWAY, str(e)) from e
    a = Analysis(user_id=user.id, resume_id=resume.id, job_id=job.id, result=result)
    db.add(a)
    db.commit()
    return a


@router.get("/analyses/{analysis_id}", response_model=AnalysisOut)
def get_analysis(analysis_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = db.get(Analysis, analysis_id)
    if not a or a.user_id != user.id:
        raise HTTPException(404, "Analysis not found.")
    return a


@router.get("/analyses", response_model=list[AnalysisOut])
def list_analyses(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.scalars(select(Analysis).where(Analysis.user_id == user.id).order_by(Analysis.created_at.desc()).limit(20)).all()

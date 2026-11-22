"""Database tables. See docs/DATABASE.md for the schema diagram."""
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120), default="")
    password_hash: Mapped[str] = mapped_column(String(255))
    preferences: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

    documents: Mapped[list["Document"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    interviews: Mapped[list["Interview"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Document(Base):
    """An uploaded resume or job description, with its extracted text."""
    __tablename__ = "documents"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(16))  # resume | job
    filename: Mapped[str] = mapped_column(String(255), default="")
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    user: Mapped[User] = relationship(back_populates="documents")


class Analysis(Base):
    """AI analysis of one resume against one job description."""
    __tablename__ = "analyses"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    resume_id: Mapped[int] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"))
    job_id: Mapped[int] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"))
    result: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Interview(Base):
    __tablename__ = "interviews"
    __mapper_args__ = {"confirm_deleted_rows": False}  # DB-level cascades may delete rows first
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    analysis_id: Mapped[int] = mapped_column(ForeignKey("analyses.id", ondelete="CASCADE"))
    role_title: Mapped[str] = mapped_column(String(255), default="AI/ML Engineer")
    duration_minutes: Mapped[int] = mapped_column(Integer, default=30)
    difficulty: Mapped[str] = mapped_column(String(16), default="Intermediate")
    interview_type: Mapped[str] = mapped_column(String(32), default="Full interview")
    language: Mapped[str] = mapped_column(String(16), default="English")
    question_count: Mapped[int] = mapped_column(Integer, default=10)
    # ready -> live <-> paused -> finished -> scored
    status: Mapped[str] = mapped_column(String(16), default="ready")
    current_index: Mapped[int] = mapped_column(Integer, default=0)
    followups_asked: Mapped[int] = mapped_column(Integer, default=0)
    elapsed_seconds: Mapped[int] = mapped_column(Integer, default=0)
    consent_given_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    report: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

    user: Mapped[User] = relationship(back_populates="interviews")
    questions: Mapped[list["Question"]] = relationship(
        back_populates="interview", cascade="all, delete-orphan", order_by="Question.position"
    )
    recordings: Mapped[list["Recording"]] = relationship(back_populates="interview", cascade="all, delete-orphan")


class Question(Base):
    __tablename__ = "questions"
    __mapper_args__ = {"confirm_deleted_rows": False}  # DB-level cascades may delete rows first
    id: Mapped[int] = mapped_column(primary_key=True)
    interview_id: Mapped[int] = mapped_column(ForeignKey("interviews.id", ondelete="CASCADE"), index=True)
    position: Mapped[float] = mapped_column(Float)  # follow-ups slot in between (e.g. 2.5)
    category: Mapped[str] = mapped_column(String(16))  # python|sql|ml|dl|genai|project|hr
    topic: Mapped[str] = mapped_column(String(120), default="")
    text: Mapped[str] = mapped_column(Text)
    grounding: Mapped[str] = mapped_column(Text, default="")
    followup_of_id: Mapped[int | None] = mapped_column(ForeignKey("questions.id", ondelete="CASCADE"), nullable=True)

    interview: Mapped[Interview] = relationship(back_populates="questions")
    answer: Mapped["Answer | None"] = relationship(back_populates="question", cascade="all, delete-orphan", uselist=False)


class Answer(Base):
    __tablename__ = "answers"
    id: Mapped[int] = mapped_column(primary_key=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id", ondelete="CASCADE"), unique=True)
    transcript: Mapped[str] = mapped_column(Text, default="")
    skipped: Mapped[bool] = mapped_column(Boolean, default=False)
    audio_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    evaluation: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

    question: Mapped[Question] = relationship(back_populates="answer")


class Recording(Base):
    """The full audio+video recording of an interview, uploaded in chunks."""
    __tablename__ = "recordings"
    id: Mapped[int] = mapped_column(primary_key=True)
    interview_id: Mapped[int] = mapped_column(ForeignKey("interviews.id", ondelete="CASCADE"), index=True)
    path: Mapped[str] = mapped_column(String(500))
    mime_type: Mapped[str] = mapped_column(String(100), default="video/webm")
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    next_chunk: Mapped[int] = mapped_column(Integer, default=0)
    complete: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

    interview: Mapped[Interview] = relationship(back_populates="recordings")

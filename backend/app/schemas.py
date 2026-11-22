"""Request/response models for the REST API."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(default="", max_length=120)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    preferences: dict
    model_config = {"from_attributes": True}


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=120)
    preferences: dict | None = None


class DocumentOut(BaseModel):
    id: int
    kind: str
    filename: str
    text: str
    created_at: datetime
    model_config = {"from_attributes": True}


class AnalysisIn(BaseModel):
    resume_id: int
    job_id: int


class AnalysisOut(BaseModel):
    id: int
    resume_id: int
    job_id: int
    result: dict
    created_at: datetime
    model_config = {"from_attributes": True}


class InterviewCreate(BaseModel):
    analysis_id: int
    duration_minutes: Literal[15, 30, 45, 60] = 30
    difficulty: Literal["Beginner", "Intermediate", "Advanced"] = "Intermediate"
    interview_type: Literal["Technical", "HR", "Project-based", "Full interview"] = "Full interview"
    language: Literal["English", "Telugu"] = "English"
    question_count: int = Field(default=10, ge=3, le=25)


class StartIn(BaseModel):
    consent: bool


class ElapsedIn(BaseModel):
    elapsed_seconds: int = Field(ge=0, le=6 * 3600)


class QuestionOut(BaseModel):
    id: int
    position: float
    category: str
    topic: str
    text: str
    grounding: str
    followup_of_id: int | None
    answer: dict | None = None


class InterviewOut(BaseModel):
    id: int
    role_title: str
    duration_minutes: int
    difficulty: str
    interview_type: str
    language: str
    question_count: int
    status: str
    current_index: int
    total_questions: int
    elapsed_seconds: int
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    consent_given_at: datetime | None
    questions: list[QuestionOut]
    report: dict | None
    has_recording: bool
    recording_bytes: int
    recording_next_chunk: int
    scored_answers: int
    answered: int


class InterviewSummary(BaseModel):
    id: int
    role_title: str
    interview_type: str
    difficulty: str
    language: str
    status: str
    created_at: datetime
    answered: int
    total_questions: int
    overall: int | None
    readiness: str | None


class AnswerResult(BaseModel):
    acknowledgement: str
    finished: bool
    next_question: QuestionOut | None
    current_index: int
    total_questions: int

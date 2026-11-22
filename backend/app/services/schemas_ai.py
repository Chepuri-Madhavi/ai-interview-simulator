"""Structured-output schemas that Claude fills in. Kept simple so they map to JSON Schema directly."""
from typing import Literal

from pydantic import BaseModel

Category = Literal["python", "sql", "ml", "dl", "genai", "project", "hr"]


class Skills(BaseModel):
    languages: list[str]
    frameworks_libraries: list[str]
    ml_ai: list[str]
    data_sql: list[str]
    tools_cloud: list[str]


class Project(BaseModel):
    name: str
    summary: str
    technologies: list[str]


class Experience(BaseModel):
    role: str
    organization: str
    period: str | None
    highlights: list[str]


class Education(BaseModel):
    degree: str
    institution: str
    period: str | None


class Candidate(BaseModel):
    name: str | None
    headline: str
    years_experience: float | None
    skills: Skills
    projects: list[Project]
    experience: list[Experience]
    internships: list[Experience]
    education: list[Education]
    certifications: list[str]


class Job(BaseModel):
    title: str
    company: str | None
    seniority: str | None
    required_skills: list[str]
    preferred_skills: list[str]
    responsibilities: list[str]
    tools: list[str]
    experience_required: str | None


class LikelyTopic(BaseModel):
    topic: str
    category: Category
    reason: str


class Comparison(BaseModel):
    match_score: int
    match_summary: str
    matching_skills: list[str]
    missing_skills: list[str]
    strengths: list[str]
    improvement_areas: list[str]
    likely_topics: list[LikelyTopic]


class AnalysisResult(BaseModel):
    candidate: Candidate
    job: Job
    comparison: Comparison


class PlannedQuestion(BaseModel):
    category: Category
    topic: str
    question: str
    grounding: str


class QuestionPlan(BaseModel):
    questions: list[PlannedQuestion]


class FollowupDecision(BaseModel):
    acknowledgement: str
    followup: str | None


class Rubric(BaseModel):
    technical_accuracy: int
    conceptual_understanding: int
    relevance: int
    clarity: int
    practical_knowledge: int
    communication: int
    structure: int


class Evaluation(BaseModel):
    score: float
    rubric: Rubric
    verdict: Literal["correct", "partially correct", "incorrect", "not answered"]
    correct_points: list[str]
    missing_points: list[str]
    mistakes: list[str]
    how_to_improve: str
    stronger_answer: str


class TopicToRevise(BaseModel):
    topic: str
    why: str


class Readiness(BaseModel):
    verdict: Literal["Ready", "Almost ready", "Needs more practice", "Not ready yet"]
    summary: str


class ReportSummary(BaseModel):
    headline: str
    strongest_areas: list[str]
    weakest_areas: list[str]
    topics_to_revise: list[TopicToRevise]
    next_steps: list[str]
    readiness: Readiness

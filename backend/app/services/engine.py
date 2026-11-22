"""Interview logic: analysis, question planning, follow-ups, evaluation and the final report."""
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from ..models import Analysis, Answer, Interview, Question
from . import prompts
from . import schemas_ai as S
from .llm import LLM, LLMError

log = logging.getLogger(__name__)

RUBRIC_KEYS = list(S.Rubric.model_fields)
DURATION_QUESTIONS = {15: 6, 30: 10, 45: 14, 60: 18}


def analyze(llm: LLM, resume: str, job: str) -> dict:
    result = llm.generate(prompts.analysis_prompt(resume, job), S.AnalysisResult)
    data = result.model_dump()
    data["comparison"]["match_score"] = max(0, min(100, int(data["comparison"]["match_score"])))
    return data


def plan_questions(llm: LLM, analysis: Analysis, resume: str, job: str, iv: Interview) -> list[Question]:
    plan = llm.generate(
        prompts.question_prompt(analysis.result, resume, job, count=iv.question_count, minutes=iv.duration_minutes,
                                difficulty=iv.difficulty, interview_type=iv.interview_type, language=iv.language),
        S.QuestionPlan,
    )
    seen: set[str] = set()
    out: list[Question] = []
    for q in plan.questions:
        key = " ".join(q.question.lower().split())
        if not q.question.strip() or key in seen:
            continue
        seen.add(key)
        out.append(Question(position=float(len(out) + 1), category=q.category, topic=q.topic[:120], text=q.question.strip(),
                            grounding=q.grounding))
        if len(out) == iv.question_count:
            break
    if len(out) < min(3, iv.question_count):
        raise LLMError("The AI returned too few questions. Try generating again.")
    return out


def max_followups(iv: Interview) -> int:
    return max(1, iv.question_count // 4)


def decide_followup(llm: LLM, iv: Interview, q: Question, answer: str) -> S.FollowupDecision:
    asked = [x.text for x in iv.questions]
    return llm.generate(
        prompts.followup_prompt(iv.role_title, iv.difficulty, iv.language, asked, q.text, answer),
        S.FollowupDecision, quick=True,
    )


def empty_evaluation() -> dict:
    return S.Evaluation(
        score=0, rubric=S.Rubric(**{k: 0 for k in RUBRIC_KEYS}), verdict="not answered", correct_points=[],
        missing_points=["No answer was given."], mistakes=[],
        how_to_improve="Attempt every question, even partially: explain what you know and how you would find the rest.",
        stronger_answer="",
    ).model_dump()


def evaluate(llm: LLM, iv: Interview, q: Question, ans: Answer, candidate: dict | None) -> dict:
    if ans.skipped or not ans.transcript.strip():
        return empty_evaluation()
    needs_resume = q.category in ("project", "hr")
    ev = llm.generate(
        prompts.evaluation_prompt(iv.role_title, iv.difficulty, prompts.CATEGORY_NAMES[q.category], q.topic, q.text,
                                  ans.transcript, candidate if needs_resume else None),
        S.Evaluation,
    )
    data = ev.model_dump()
    data["score"] = round(max(0.0, min(10.0, float(data["score"]))), 1)
    data["rubric"] = {k: max(0, min(10, int(v))) for k, v in data["rubric"].items()}
    return data


def evaluate_pending(db: Session, llm: LLM, iv: Interview, candidate: dict | None, workers: int = 4) -> list[str]:
    """Score every answer that has no evaluation yet, in parallel. Returns error messages for failures."""
    pending = [q for q in iv.questions if q.answer and q.answer.evaluation is None]
    errors: list[str] = []

    def run(q: Question):
        return q, evaluate(llm, iv, q, q.answer, candidate)

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(run, q) for q in pending]
        for f in futures:
            try:
                q, ev = f.result()
                q.answer.evaluation = ev
                q.answer.score = ev["score"]
            except LLMError as e:
                errors.append(str(e))
    db.commit()
    return errors


def category_scores(iv: Interview) -> dict:
    by: dict[str, list[float]] = {}
    comm: list[int] = []
    allv: list[float] = []
    for q in iv.questions:
        a = q.answer
        if not a or not a.evaluation:
            continue
        by.setdefault(q.category, []).append(a.evaluation["score"])
        allv.append(a.evaluation["score"])
        if not a.skipped:
            comm.append(a.evaluation["rubric"]["communication"])

    def pct(xs):
        return round(sum(xs) / len(xs) * 10) if xs else None

    out = {c: pct(by.get(c, [])) for c in prompts.CATEGORY_NAMES}
    out["communication"] = pct(comm)
    out["overall"] = pct(allv)
    return out


def build_report(llm: LLM, iv: Interview, missing_skills: list[str]) -> dict:
    scores = category_scores(iv)
    items = []
    for q in iv.questions:
        if q.answer and q.answer.evaluation:
            e = q.answer.evaluation
            items.append({"category": prompts.CATEGORY_NAMES[q.category], "question": q.text, "score": e["score"],
                          "verdict": e["verdict"], "missing": e["missing_points"][:3], "mistakes": e["mistakes"][:3]})
    if not items:
        raise LLMError("No questions were answered, so there is nothing to score.", False)
    summary = llm.generate(prompts.report_prompt(iv.role_title, scores, missing_skills, items), S.ReportSummary)
    incorrect = [
        {"question_id": q.id, "question": q.text, "score": q.answer.evaluation["score"]}
        for q in iv.questions if q.answer and q.answer.evaluation and q.answer.evaluation["score"] < 5
    ]
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scores": scores,
        "answered": len(items),
        "incorrect": incorrect,
        **summary.model_dump(),
    }

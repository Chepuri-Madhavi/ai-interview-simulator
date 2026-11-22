"""Deterministic stand-in for Claude, used ONLY by the automated tests (LLM_PROVIDER=fake).

It derives its answers from the prompt text so tests can check that documents and answers reach the model.
"""
import re

from . import schemas_ai as S


def _between(prompt: str, name: str) -> str:
    m = re.search(rf"<<<{name}\n(.*?)\n{name}>>>", prompt, re.S)
    return m.group(1) if m else ""


class FakeLLM:
    def __init__(self):
        self.calls: list[tuple[str, str]] = []

    def generate(self, prompt, schema, *, quick=False):
        self.calls.append((schema.__name__, prompt))
        if schema is S.AnalysisResult:
            resume = _between(prompt, "RESUME")
            projects = re.findall(r"^\s*\d\.\s*([^\n-]+?)\s+-", resume, re.M) or ["Main project"]
            skills = [s for s in ["Python", "SQL", "LangChain", "FAISS", "TensorFlow", "XGBoost"] if s in resume]
            return S.AnalysisResult(
                candidate=S.Candidate(
                    name=resume.strip().splitlines()[0][:60] if resume.strip() else None, headline="ML candidate",
                    years_experience=0,
                    skills=S.Skills(languages=[s for s in skills if s in ("Python", "SQL")], frameworks_libraries=[s for s in skills if s not in ("Python", "SQL")], ml_ai=[], data_sql=[], tools_cloud=[]),
                    projects=[S.Project(name=p.strip(), summary="From resume", technologies=[]) for p in projects],
                    experience=[], internships=[], education=[], certifications=[],
                ),
                job=S.Job(title="Associate AI/ML Engineer", company="TestCo", seniority=None, required_skills=["Python", "SQL", "LangGraph"],
                          preferred_skills=[], responsibilities=["Build RAG"], tools=[], experience_required="0-2 years"),
                comparison=S.Comparison(match_score=72, match_summary="Fake analysis.", matching_skills=skills, missing_skills=["LangGraph"],
                                        strengths=["Projects"], improvement_areas=["Agents"],
                                        likely_topics=[S.LikelyTopic(topic="RAG", category="genai", reason="JD")]),
            )
        if schema is S.QuestionPlan:
            n = int(re.search(r"(\d+) questions", prompt).group(1))
            pool = [("hr", "Please introduce yourself."), ("project", "Walk me through the architecture of your main project."),
                    ("python", "What is the difference between a list and a tuple in Python?"), ("sql", "Explain INNER JOIN versus LEFT JOIN."),
                    ("ml", "How do you detect overfitting?"), ("dl", "Explain backpropagation."), ("genai", "What is retrieval-augmented generation?"),
                    ("hr", "Why should we hire you?")]
            qs = [S.PlannedQuestion(category=c, topic=c, question=f"{q} (#{i + 1})", grounding="test") for i, (c, q) in enumerate((pool * 3)[:n])]
            return S.QuestionPlan(questions=qs)
        if schema is S.FollowupDecision:
            answer = _between(prompt, "ANSWER")
            return S.FollowupDecision(acknowledgement="Thank you.", followup="Can you give a concrete example?" if "FOLLOWUP" in answer else None)
        if schema is S.Evaluation:
            answer = _between(prompt, "ANSWER")
            score = 8.0 if "good" in answer.lower() else 4.0
            r = int(score)
            return S.Evaluation(score=score, rubric=S.Rubric(technical_accuracy=r, conceptual_understanding=r, relevance=r, clarity=r,
                                                           practical_knowledge=r, communication=r, structure=r),
                                verdict="correct" if score >= 7 else "incorrect", correct_points=["point"], missing_points=["missing"],
                                mistakes=[] if score >= 7 else ["mistake"], how_to_improve="Be specific.", stronger_answer="A stronger answer.")
        if schema is S.ReportSummary:
            return S.ReportSummary(headline="Fake report.", strongest_areas=["A"], weakest_areas=["B"],
                                   topics_to_revise=[S.TopicToRevise(topic="LangGraph", why="Missing")], next_steps=["Practice"],
                                   readiness=S.Readiness(verdict="Needs more practice", summary="Fake."))
        raise NotImplementedError(schema)

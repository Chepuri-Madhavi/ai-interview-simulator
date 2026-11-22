"""Prompt templates. Documents and answers are wrapped in <<<NAME ... NAME>>> markers (see llm.SYSTEM)."""
import json

CATEGORY_NAMES = {
    "python": "Python", "sql": "SQL", "ml": "Machine Learning", "dl": "Deep Learning",
    "genai": "Generative AI", "project": "Projects", "hr": "HR & Behavioral",
}

TYPE_MIX = {
    "Technical": "Only technical categories: python, sql, ml, dl, genai. Weight them by what the job description emphasizes; "
                 "skip a category the job does not need when the question count is small.",
    "HR": "Only the hr category: self-introduction, a career gap (only if the resume shows one), strengths and weaknesses, "
          "why hire you, career goals, teamwork, problem-solving and motivation for this specific job.",
    "Project-based": "Start with one short hr self-introduction question, then project questions. Cover every project and internship on "
                     "the resume: architecture, technology choices, the candidate's own contribution, challenges and solutions, and "
                     "realistic scenario questions (scaling, failure cases, what they would change).",
    "Full interview": "Start with an hr self-introduction. Then cover the resume's projects (at least one question per project when the "
                      "count allows), then technical categories weighted by the job description (python, sql, ml, dl, genai), and end "
                      "with one or two hr/behavioral questions.",
}

DIFFICULTY = ("Beginner = definitions and simple examples; Intermediate = trade-offs, 'how would you' questions, small verbal coding "
              "problems; Advanced = system design, debugging production issues, deep internals.")


def block(name: str, text: str, limit: int) -> str:
    return f"<<<{name}\n{text[:limit]}\n{name}>>>"


def analysis_prompt(resume: str, job: str) -> str:
    return f"""Analyze this candidate's resume against the job description for an AI/ML engineering role.

Rules:
- Use only facts written in the documents. Never invent projects, employers, skills, dates or numbers; use empty lists or null when absent.
- missing_skills are skills or tools the job asks for that the resume does not show.
- match_score (0-100) estimates how well the resume covers the job's requirements.
- likely_topics: 5-10 topics this interview will probably cover, each with its category.

{block("RESUME", resume, 15000)}

{block("JOB_DESCRIPTION", job, 10000)}"""


def question_prompt(analysis: dict, resume: str, job: str, *, count: int, minutes: int, difficulty: str, interview_type: str,
                    language: str) -> str:
    lang = ("Write every question in natural spoken Telugu (Telugu script), keeping technical terms such as Python, SQL, RAG, "
            "transformer or overfitting in English. Keep 'topic' and 'grounding' in English."
            if language == "Telugu" else "Write every question in English.")
    return f"""Prepare a personalized {interview_type.lower()} for the role below: exactly {count} questions for {minutes} minutes, difficulty {difficulty}.

Question mix: {TYPE_MIX[interview_type]}
Difficulty guide: {DIFFICULTY}

Rules:
- Ground every question in the resume or the job description and say which in "grounding" (under 20 words).
- Never claim the candidate did something the resume does not state. For a skill the job requires but the resume lacks, ask a
  conceptual or "how would you approach" question, never "tell me about your experience with".
- Project questions must name the real project from the resume.
- Questions are spoken aloud and answered verbally, so coding questions ask the candidate to explain an approach or describe code.
- One clear question each, under 45 words, no multi-part lists, no duplicates or near-duplicates, no answers or hints.
- {lang}

Extracted analysis:
{json.dumps(analysis, ensure_ascii=False)[:12000]}

{block("RESUME", resume, 9000)}

{block("JOB_DESCRIPTION", job, 6000)}"""


def followup_prompt(role: str, difficulty: str, language: str, asked: list[str], question: str, answer: str) -> str:
    lang = "Write both fields in Telugu (technical terms in English)." if language == "Telugu" else "Write in English."
    asked_list = "\n".join(f"- {q}" for q in asked)
    return f"""You are a professional, neutral technical interviewer in a live {role} interview (difficulty {difficulty}).
The candidate just answered. Decide whether to ask ONE short follow-up question (set followup to null otherwise).

Ask a follow-up only when the answer was vague, partially correct, or mentioned a specific decision, technique or result worth
probing. Not when the answer was empty, off-topic or already thorough.
Never reveal, hint at or confirm the correct answer. Never praise correctness. Never repeat a question below.
The acknowledgement is a short neutral phrase a real interviewer says before moving on (max 8 words).
{lang}

Questions already asked or planned:
{asked_list}

Question: {question}
{block("ANSWER", answer or "(no answer given)", 4000)}"""


def evaluation_prompt(role: str, difficulty: str, category: str, topic: str, question: str, answer: str,
                      candidate_summary: dict | None) -> str:
    resume_part = ""
    if candidate_summary is not None:
        resume_part = "\nCandidate resume summary (for judging project/HR answers):\n" + json.dumps(candidate_summary, ensure_ascii=False)[:5000] + "\n"
    return f"""Score one answer from a practice interview for: {role}. Difficulty: {difficulty}.

Fairness rules:
- The answer is a speech-to-text transcript. It may contain transcription mistakes, filler words, repetitions or misspelled
  technical words caused by accent or audio. Do not penalize these, the candidate's accent, grammar or speaking style. Judge
  content, reasoning and structure. The question may be in Telugu; the answer may mix Telugu and English.
- Do not infer personality, honesty, emotion or confidence from anything except how the answer is organized.
- If the answer is empty, every score is 0 and the verdict is "not answered".
- For project and HR questions, judge against the candidate's own resume. The stronger answer may only use facts from the resume
  (it can show how to present them better); never invent experience.
- Write all feedback in English.

Score each rubric item as an integer 0-10: technical_accuracy (for HR questions: soundness and credibility of the content),
conceptual_understanding, relevance, clarity, practical_knowledge, communication, structure (confidence shown through organization).
score is the overall 0-10 (one decimal allowed), weighted toward technical accuracy and understanding for technical questions.
stronger_answer: 90-180 words in natural spoken style.

Category: {category} | Topic: {topic}
Question: {question}
{resume_part}
{block("ANSWER", answer or "(no answer given)", 6000)}"""


def report_prompt(role: str, category_scores: dict, missing_skills: list[str], items: list[dict]) -> str:
    lines = "\n".join(
        f"{i + 1}. [{it['category']}] {it['question']}\n   score {it['score']}/10, verdict {it['verdict']}; "
        f"missing: {'; '.join(it['missing'])}; mistakes: {'; '.join(it['mistakes'])}"
        for i, it in enumerate(items)
    )
    return f"""Write the final debrief for a candidate's practice interview for: {role}.
Base everything only on the scored answers below. Be specific, constructive and honest. Write in English.
Do not comment on personality, appearance or accent.
Give 2-4 strongest and weakest areas, 3-8 topics to revise, and 3-6 concrete next steps.

Category scores (0-100, null = not asked): {json.dumps(category_scores)}
Skills the job needs that the resume does not show: {json.dumps(missing_skills, ensure_ascii=False)}

Scored answers:
{lines}"""

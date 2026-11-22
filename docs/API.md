# REST API

Base path: `/api`. Interactive docs (OpenAPI/Swagger) are served at `/docs` when the backend runs.

**Auth:** send `Authorization: Bearer <token>` (from register/login). Media URLs used directly in `<video>` or
`<audio>` tags may pass `?token=<token>` instead. Every resource is owner-only; other users get `404`.

**Errors** are JSON `{"detail": "<message for the user>"}`. AI failures return `503` (temporary, worth retrying) or
`502` (needs a configuration change or different input).

## Meta
| Method | Path | Description |
|---|---|---|
| GET | `/health` | `{"status":"ok"}` |
| GET | `/config` | `{server_transcription, test_mode, max_upload_mb}` |

## Accounts
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/auth/register` | `{email, password (≥8), full_name?}` | `201 {access_token, token_type, user}`; `409` if the email exists |
| POST | `/auth/login` | `{email, password}` | `{access_token, token_type, user}`; `401` on bad credentials |
| GET | `/auth/me` | | `user` |
| PATCH | `/auth/me` | `{full_name?, preferences?}` | `user` (preferences keys: `tts_voice, tts_rate, auto_speak, default_language, theme`) |
| DELETE | `/auth/me` | | `204`; deletes the account, all rows and all recordings |

## Documents and analysis
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/documents` | multipart: `kind` = `resume`\|`job`, and `file` (PDF/DOCX ≤ MAX_UPLOAD_MB) **or** `text` | `201 {id, kind, filename, text, created_at}`; `422` with a reason (wrong type, not a real PDF/DOCX, encrypted, scanned/too little text, too large) |
| GET | `/documents?kind=` | | latest 50 documents |
| DELETE | `/documents/{id}` | | `204` |
| GET | `/samples` | | `{resume, job}` fictional sample texts |
| POST | `/analyses` | `{resume_id, job_id}` | `201 {id, resume_id, job_id, result, created_at}`: calls Claude (20-60 s) |
| GET | `/analyses/{id}` | | analysis |
| GET | `/analyses` | | latest 20 |

`result` = `{candidate: {name, headline, years_experience, skills{languages, frameworks_libraries, ml_ai, data_sql, tools_cloud}, projects[], experience[], internships[], education[], certifications[]}, job: {title, company, seniority, required_skills[], preferred_skills[], responsibilities[], tools[], experience_required}, comparison: {match_score, match_summary, matching_skills[], missing_skills[], strengths[], improvement_areas[], likely_topics[{topic, category, reason}]}}`

## Interviews
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/interviews` | `{analysis_id, duration_minutes: 15\|30\|45\|60, difficulty, interview_type, language: English\|Telugu, question_count: 3-25}` | `201 Interview`: Claude writes the questions. They are **hidden** (`questions: []`) until the interview starts. |
| GET | `/interviews` | | list of `{id, role_title, interview_type, difficulty, language, status, created_at, answered, total_questions, overall, readiness}` |
| GET | `/interviews/{id}` | | `Interview` |
| POST | `/interviews/{id}/start` | `{consent: true}` | `Interview` (status `live`); `400` without consent |
| POST | `/interviews/{id}/pause` | `{elapsed_seconds}` | `Interview` (status `paused`) |
| POST | `/interviews/{id}/resume` | | `Interview` (status `live`) |
| POST | `/interviews/{id}/answers` | multipart: `question_id, transcript, skipped, duration_seconds, elapsed_seconds, audio?` | `AnswerResult`; `409` if not live or not the current question; `422` if empty and not skipped |
| POST | `/interviews/{id}/transcribe` | multipart `audio` | `{transcript}`; only with `STT_PROVIDER=faster_whisper` (else `409`) |
| POST | `/interviews/{id}/finish` | `{elapsed_seconds}` | `Interview` (status `finished`): ends early |
| POST | `/interviews/{id}/report` | | `Interview` with `report` (status `scored`): scores unscored answers, then writes the summary (up to ~1-2 min) |
| GET | `/interviews/{id}/report.pdf` | | `application/pdf` |
| DELETE | `/interviews/{id}` | | `204`; deletes rows and files |
| GET | `/interviews/{id}/answers/{question_id}/audio` | | the answer's audio |

**AnswerResult:** `{acknowledgement, finished, next_question: Question|null, current_index, total_questions}`.
After each answer the server may insert one follow-up question (never for a follow-up, at most
`max(1, question_count/4)` per interview, not in the last 15% of the time). The answer is scored in the background.

**Interview:** `{id, role_title, duration_minutes, difficulty, interview_type, language, question_count, status,
current_index, total_questions, elapsed_seconds, created_at, started_at, finished_at, consent_given_at,
questions: Question[], report, has_recording, recording_bytes, recording_next_chunk, scored_answers, answered}`.
While live, `questions` holds only the questions asked so far.

**Question:** `{id, position, category, topic, text, grounding, followup_of_id, answer: {transcript, skipped, score, evaluation, has_audio, duration_seconds} | null}`

**evaluation:** `{score (0-10), rubric: {technical_accuracy, conceptual_understanding, relevance, clarity, practical_knowledge, communication, structure} (0-10 each), verdict, correct_points[], missing_points[], mistakes[], how_to_improve, stronger_answer}`

**report:** `{generated_at, scores: {python, sql, ml, dl, genai, project, hr, communication, overall} (0-100 or null when not asked), answered, incorrect[{question_id, question, score}], headline, strongest_areas[], weakest_areas[], topics_to_revise[{topic, why}], next_steps[], readiness: {verdict: Ready|Almost ready|Needs more practice|Not ready yet, summary}}`.
Category scores are averages of the per-answer scores × 10, computed in code; communication averages the rubric's
communication score over answered (non-skipped) questions.

## Recording
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/interviews/{id}/recording/chunks?index=N` | multipart `chunk` (≤ 20 MB) | `{next_chunk, size_bytes}`. Chunks must arrive in order; a repeated index is ignored (safe retries); a gap returns `409`. `403` before consent; `413` over MAX_RECORDING_MB. |
| POST | `/interviews/{id}/recording/complete` | | `{size_bytes}` |
| GET | `/interviews/{id}/recording` | | the WebM file |
| DELETE | `/interviews/{id}/recording` | | `204`; deletes the session video and all answer audio, keeps transcripts and scores |

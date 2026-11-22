export type Category = "python" | "sql" | "ml" | "dl" | "genai" | "project" | "hr";

export interface User { id: number; email: string; full_name: string; preferences: Preferences }
export interface Preferences { tts_voice?: string; tts_rate?: number; auto_speak?: boolean; default_language?: string; theme?: string }
export interface DocumentOut { id: number; kind: "resume" | "job"; filename: string; text: string; created_at: string }

export interface Experience { role: string; organization: string; period: string | null; highlights: string[] }
export interface AnalysisResult {
  candidate: {
    name: string | null; headline: string; years_experience: number | null;
    skills: { languages: string[]; frameworks_libraries: string[]; ml_ai: string[]; data_sql: string[]; tools_cloud: string[] };
    projects: { name: string; summary: string; technologies: string[] }[];
    experience: Experience[]; internships: Experience[];
    education: { degree: string; institution: string; period: string | null }[];
    certifications: string[];
  };
  job: { title: string; company: string | null; seniority: string | null; required_skills: string[]; preferred_skills: string[];
    responsibilities: string[]; tools: string[]; experience_required: string | null };
  comparison: { match_score: number; match_summary: string; matching_skills: string[]; missing_skills: string[]; strengths: string[];
    improvement_areas: string[]; likely_topics: { topic: string; category: Category; reason: string }[] };
}
export interface AnalysisOut { id: number; resume_id: number; job_id: number; result: AnalysisResult; created_at: string }

export interface Rubric { technical_accuracy: number; conceptual_understanding: number; relevance: number; clarity: number;
  practical_knowledge: number; communication: number; structure: number }
export interface Evaluation { score: number; rubric: Rubric; verdict: string; correct_points: string[]; missing_points: string[];
  mistakes: string[]; how_to_improve: string; stronger_answer: string }
export interface AnswerOut { transcript: string; skipped: boolean; score: number | null; evaluation: Evaluation | null; has_audio: boolean; duration_seconds: number }
export interface Question { id: number; position: number; category: Category; topic: string; text: string; grounding: string;
  followup_of_id: number | null; answer: AnswerOut | null }

export type Scores = Record<Category | "communication" | "overall", number | null>;
export interface Report {
  generated_at: string; scores: Scores; answered: number; incorrect: { question_id: number; question: string; score: number }[];
  headline: string; strongest_areas: string[]; weakest_areas: string[]; topics_to_revise: { topic: string; why: string }[];
  next_steps: string[]; readiness: { verdict: string; summary: string };
}
export interface Interview {
  id: number; role_title: string; duration_minutes: number; difficulty: string; interview_type: string; language: "English" | "Telugu";
  question_count: number; status: "ready" | "live" | "paused" | "finished" | "scored"; current_index: number; total_questions: number;
  elapsed_seconds: number; created_at: string; started_at: string | null; finished_at: string | null; consent_given_at: string | null;
  questions: Question[]; report: Report | null; has_recording: boolean; recording_bytes: number; recording_next_chunk: number; scored_answers: number; answered: number;
}
export interface InterviewSummary { id: number; role_title: string; interview_type: string; difficulty: string; language: string;
  status: Interview["status"]; created_at: string; answered: number; total_questions: number; overall: number | null; readiness: string | null }
export interface AnswerResult { acknowledgement: string; finished: boolean; next_question: Question | null; current_index: number; total_questions: number }
export interface PublicConfig { server_transcription: boolean; test_mode: boolean; max_upload_mb: number }

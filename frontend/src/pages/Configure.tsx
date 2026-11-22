import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Notice, Spinner, Steps } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { DURATION_QUESTIONS } from "../lib/constants";
import type { AnalysisOut } from "../lib/types";

function Segmented<T extends string | number>({ id, label, options, value, onChange, render }: {
  id: string; label: string; options: readonly T[]; value: T; onChange: (v: T) => void; render?: (v: T) => string }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="label" id={`${id}-label`}>{label}</span>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-labelledby={`${id}-label`}>
        {options.map((o) => (
          <button key={String(o)} type="button" role="radio" aria-checked={value === o} onClick={() => onChange(o)}
            className={`rounded-lg border px-3.5 py-2 text-sm font-medium ${value === o ? "border-accent bg-accent-soft font-semibold text-accent" : "border-line bg-surface hover:bg-surface2"}`}>
            {render ? render(o) : String(o)}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Configure() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [analysis, setAnalysis] = useState<AnalysisOut | null>(null);
  const [duration, setDuration] = useState<15 | 30 | 45 | 60>(30);
  const [difficulty, setDifficulty] = useState<"Beginner" | "Intermediate" | "Advanced">("Intermediate");
  const [type, setType] = useState<"Technical" | "HR" | "Project-based" | "Full interview">("Full interview");
  const [language, setLanguage] = useState<"English" | "Telugu">((user?.preferences.default_language as "English" | "Telugu") || "English");
  const [count, setCount] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.analysis(Number(id)).then(setAnalysis).catch((e) => setError(e.message)); }, [id]);

  async function generate() {
    setBusy(true); setError(null);
    try {
      const iv = await api.createInterview({ analysis_id: Number(id), duration_minutes: duration, difficulty, interview_type: type, language, question_count: count });
      nav(`/interviews/${iv.id}/check`);
    } catch (e) { setError(e instanceof ApiError ? e.message : "Could not generate questions."); setBusy(false); }
  }
  if (busy) return <div className="flex flex-col gap-6"><Steps current={3} /><div className="panel"><Spinner label="Writing your personalized questions…" />
    <p className="text-center text-sm text-muted">Questions come from your resume and this job description. This takes about 20–60 seconds.</p></div></div>;
  return (
    <div className="flex flex-col gap-6">
      <Steps current={3} />
      <div><h1 className="page-title">Configure your interview</h1>
        <p className="mt-1 text-muted">Role: {analysis?.result.job.title ?? "…"}. Questions stay hidden until the interview starts.</p></div>
      {error && <Notice kind="bad">{error}</Notice>}
      <div className="panel flex flex-col gap-6">
        <Segmented id="duration" label="Duration" options={[15, 30, 45, 60] as const} value={duration} render={(v) => `${v} min`}
          onChange={(v) => { setDuration(v); setCount(DURATION_QUESTIONS[v]); }} />
        <Segmented id="difficulty" label="Difficulty" options={["Beginner", "Intermediate", "Advanced"] as const} value={difficulty} onChange={setDifficulty} />
        <Segmented id="type" label="Interview type" options={["Technical", "HR", "Project-based", "Full interview"] as const} value={type} onChange={setType} />
        <Segmented id="language" label="Interview language" options={["English", "Telugu"] as const} value={language} onChange={setLanguage} />
        {language === "Telugu" && <Notice kind="warn">Questions are asked in Telugu. Spoken Telugu answers need Chrome's Telugu speech recognition (te-IN) and a Telugu voice on your device for read-aloud questions; feedback is written in English.</Notice>}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between"><label className="label" htmlFor="count">Number of questions</label><span className="font-mono">{count}</span></div>
          <input id="count" type="range" min={3} max={25} value={count} onChange={(e) => setCount(Number(e.target.value))} className="accent-[rgb(var(--accent))]" />
          <p className="text-sm text-muted">Recommended for {duration} minutes: {DURATION_QUESTIONS[duration]} questions (about {(duration / count).toFixed(1)} min each). The interviewer may add a few short follow-ups.</p>
        </div>
      </div>
      <div className="flex justify-between">
        <button className="btn" onClick={() => nav(`/analysis/${id}`)}>Back to analysis</button>
        <button className="btn btn-primary" onClick={generate} disabled={!analysis}>Generate questions</button>
      </div>
    </div>
  );
}

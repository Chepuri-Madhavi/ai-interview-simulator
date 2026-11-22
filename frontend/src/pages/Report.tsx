import { Download, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Bar, BarChart, Cell, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CategoryBars, ConfirmDialog, Notice, PageHeader, ScorePill, ScoreRing, Spinner } from "../components/ui";
import { api, ApiError, saveBlob } from "../lib/api";
import { CATEGORY_COLORS, CATEGORY_NAMES, RUBRIC_NAMES } from "../lib/constants";
import { fmtBytes, fmtClock, fmtDate } from "../lib/format";
import type { Category, Interview, Question } from "../lib/types";

function List({ title, items, tone }: { title: string; items: string[]; tone?: "good" | "bad" | "warn" }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className={`eyebrow ${tone ? `text-${tone}` : ""}`}>{title}</span>
      <ul className="list-disc space-y-1 pl-5 text-sm">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </div>
  );
}

function AnswerCard({ q, n, interviewId }: { q: Question; n: number; interviewId: number }) {
  const a = q.answer!, e = a.evaluation!;
  return (
    <details className="group rounded-xl border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-start gap-3 p-4 [&::-webkit-details-marker]:hidden">
        <ScorePill value={e.score} outOf={10} />
        <div className="min-w-0 flex-1">
          <div className="text-sm text-muted">Q{n} · {CATEGORY_NAMES[q.category]}{q.followup_of_id ? " · follow-up" : ""} · {e.verdict}</div>
          <div className="font-semibold">{q.text}</div>
        </div>
      </summary>
      <div className="flex flex-col gap-4 px-4 pb-4">
        <div className="flex flex-col gap-1.5"><span className="eyebrow">Your answer</span>
          <p className="whitespace-pre-wrap border-l-[3px] border-line pl-3 text-muted">{a.skipped ? "(skipped)" : a.transcript || "(empty)"}</p>
          {a.has_audio && <audio controls preload="none" className="mt-1 h-9 w-full max-w-md" src={api.mediaUrl(`/interviews/${interviewId}/answers/${q.id}/audio`)} />}</div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-2">
          {(Object.keys(RUBRIC_NAMES) as (keyof typeof RUBRIC_NAMES)[]).map((k) => (
            <div key={k} className="flex justify-between gap-2 rounded-lg bg-surface2 px-2.5 py-2 text-[13px]"><span>{RUBRIC_NAMES[k]}</span><b className="font-mono">{e.rubric[k]}</b></div>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2"><List title="What you got right" items={e.correct_points} tone="good" /><List title="Missing points" items={e.missing_points} tone="warn" /></div>
        <List title="Technical mistakes" items={e.mistakes} tone="bad" />
        {e.how_to_improve && <div className="flex flex-col gap-1.5"><span className="eyebrow">How to improve</span><p className="text-sm">{e.how_to_improve}</p></div>}
        {e.stronger_answer && <div className="flex flex-col gap-1.5 rounded-lg bg-surface2 p-4"><span className="eyebrow">A stronger answer</span><p className="text-sm">{e.stronger_answer}</p></div>}
      </div>
    </details>
  );
}

export default function Report() {
  const { id } = useParams();
  const interviewId = Number(id);
  const nav = useNavigate();
  const [iv, setIv] = useState<Interview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<{ scored: number; answered: number } | null>(null);
  const [confirm, setConfirm] = useState<"interview" | "recording" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const started = useRef(false);

  const generate = useCallback(async () => {
    setGenerating(true); setError(null);
    const poll = setInterval(() => api.interview(interviewId).then((x) => setProgress({ scored: x.scored_answers, answered: x.answered })).catch(() => {}), 2500);
    try { setIv(await api.generateReport(interviewId)); }
    catch (e) { setError(e instanceof ApiError ? e.message : "The report could not be generated."); }
    finally { clearInterval(poll); setGenerating(false); }
  }, [interviewId]);

  useEffect(() => {
    api.interview(interviewId).then(async (x) => {
      if (["ready", "live", "paused"].includes(x.status)) x = await api.finish(interviewId, x.elapsed_seconds);
      setIv(x);
      if (!x.report && x.answered > 0 && !started.current) { started.current = true; void generate(); }
    }).catch((e) => setError(e instanceof ApiError ? e.message : "Could not load the report."));
  }, [interviewId, generate]);

  async function downloadPdf() {
    try { saveBlob(await api.reportPdf(interviewId), `interview-report-${interviewId}.pdf`); }
    catch (e) { setError(e instanceof ApiError ? e.message : "The PDF could not be downloaded."); }
  }
  async function doDelete() {
    try {
      if (confirm === "interview") { await api.deleteInterview(interviewId); nav("/history"); return; }
      await api.deleteRecording(interviewId);
      setIv(await api.interview(interviewId)); setNotice("The video recording and answer audio were deleted. Transcripts and scores were kept.");
    } catch (e) { setError(e instanceof ApiError ? e.message : "Delete failed."); }
    setConfirm(null);
  }

  if (error && !iv) return <Notice kind="bad">{error}</Notice>;
  if (!iv) return <Spinner label="Loading…" />;
  if (generating || (!iv.report && !error && iv.answered > 0)) {
    return <div className="panel"><Spinner label={progress ? `Scoring your answers… ${progress.scored} of ${progress.answered} done` : "Scoring your answers…"} />
      <p className="text-center text-sm text-muted">Each answer is evaluated separately, then the report is written. This can take a minute.</p></div>;
  }
  if (!iv.report) {
    return (
      <div className="panel flex flex-col gap-3">
        <h1 className="text-2xl font-bold">Interview finished</h1>
        {error ? <Notice kind="bad">{error}</Notice> : <p className="text-muted">{iv.answered ? "Generate the report to see your scores." : "No answers were submitted, so there is nothing to score."}</p>}
        <div className="flex flex-wrap gap-2">
          {iv.answered > 0 && <button className="btn btn-primary" onClick={generate}>{error ? "Retry" : "Generate report"}</button>}
          <button className="btn btn-danger" onClick={() => setConfirm("interview")}><Trash2 className="h-4 w-4" /> Delete interview</button>
        </div>
        <ConfirmDialog open={confirm === "interview"} danger title="Delete this interview?" confirmLabel="Delete" onCancel={() => setConfirm(null)} onConfirm={doDelete}
          body="This permanently deletes the questions, answers, recordings and report." />
      </div>
    );
  }

  const R = iv.report, s = R.scores;
  const scored = iv.questions.filter((q) => q.answer?.evaluation);
  const tone = R.readiness.verdict === "Ready" ? "good" : R.readiness.verdict === "Almost ready" ? "warn" : "bad";
  const cats = (Object.keys(CATEGORY_NAMES) as Category[]).filter((c) => s[c] != null);
  const radar = cats.map((c) => ({ area: CATEGORY_NAMES[c], score: s[c] }));
  const perQ = scored.map((q, i) => ({ name: `Q${i + 1}`, score: q.answer!.evaluation!.score, category: q.category }));
  const axis = { fill: "rgb(var(--muted))", fontSize: 12 };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={`Interview report · ${fmtDate(iv.created_at)}`} title={iv.role_title}>
        <button className="btn btn-primary" onClick={downloadPdf}><Download className="h-4 w-4" /> Download PDF</button>
        <button className="btn btn-danger" onClick={() => setConfirm("interview")}><Trash2 className="h-4 w-4" /> Delete</button>
      </PageHeader>
      {error && <Notice kind="bad">{error}</Notice>}
      {notice && <Notice kind="good">{notice}</Notice>}

      <section className="panel flex flex-wrap items-center gap-7">
        <ScoreRing value={s.overall} label="overall" />
        <div className="flex min-w-0 flex-1 basis-72 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2"><span className={`chip font-semibold bg-${tone}-soft text-${tone}`}>{R.readiness.verdict}</span>
            <span className="text-sm text-muted">{R.answered} answers scored · {fmtClock(iv.elapsed_seconds)} elapsed · {iv.difficulty} · {iv.interview_type}</span></div>
          <h2 className="text-xl font-bold">{R.headline}</h2>
          <p className="text-muted">{R.readiness.summary}</p>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="panel flex flex-col gap-4"><h3 className="font-bold">Scores by area</h3><CategoryBars scores={s} />
          <p className="text-xs text-muted">n/a means no question in this area was asked.</p></section>
        <section className="panel flex flex-col gap-2"><h3 className="font-bold">Skill profile</h3>
          {radar.length >= 3 ? (
            <div className="h-64"><ResponsiveContainer><RadarChart data={radar} outerRadius="72%">
              <PolarGrid stroke="rgb(var(--line))" /><PolarAngleAxis dataKey="area" tick={axis} /><PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
              <Radar isAnimationActive={false} dataKey="score" stroke="rgb(var(--accent))" fill="rgb(var(--accent))" fillOpacity={0.25} /></RadarChart></ResponsiveContainer></div>
          ) : <p className="text-sm text-muted">The radar chart needs questions from at least three areas.</p>}
        </section>
      </div>

      <section className="panel flex flex-col gap-2"><h3 className="font-bold">Score per question (out of 10)</h3>
        <div className="h-56"><ResponsiveContainer><BarChart data={perQ} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
          <XAxis dataKey="name" tick={axis} axisLine={{ stroke: "rgb(var(--line))" }} tickLine={false} />
          <YAxis domain={[0, 10]} ticks={[0, 5, 10]} tick={axis} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: "rgb(var(--surface-2))" }} contentStyle={{ background: "rgb(var(--surface))", border: "1px solid rgb(var(--line))", borderRadius: 8 }}
            formatter={(v: number, _n, p) => [`${v}/10`, CATEGORY_NAMES[(p.payload as { category: Category }).category]]} />
          <Bar isAnimationActive={false} dataKey="score" radius={[4, 4, 0, 0]}>{perQ.map((d, i) => <Cell key={i} fill={CATEGORY_COLORS[d.category]} />)}</Bar>
        </BarChart></ResponsiveContainer></div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="panel flex flex-col gap-4"><List title="Strongest areas" items={R.strongest_areas} tone="good" /><List title="Weakest areas" items={R.weakest_areas} tone="bad" /></section>
        <section className="panel flex flex-col gap-2"><span className="eyebrow">Topics to revise</span>
          <ul className="list-disc space-y-1 pl-5 text-sm">{R.topics_to_revise.map((t, i) => <li key={i}><strong>{t.topic}</strong>: {t.why}</li>)}</ul></section>
      </div>
      <section className="panel flex flex-col gap-2"><h3 className="font-bold">Recommended next steps</h3><ul className="list-disc space-y-1 pl-5">{R.next_steps.map((x, i) => <li key={i}>{x}</li>)}</ul></section>
      {R.incorrect.length > 0 && <section className="panel flex flex-col gap-2"><h3 className="font-bold">Questions answered incorrectly or not answered</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm">{R.incorrect.map((x) => <li key={x.question_id}>{x.question} ({x.score}/10)</li>)}</ul></section>}

      <section className="panel flex flex-col gap-3">
        <h3 className="font-bold">Interview recording</h3>
        {iv.has_recording ? (
          <>
            <video controls preload="metadata" className="aspect-video w-full max-w-2xl rounded-lg bg-stage" src={api.mediaUrl(`/interviews/${interviewId}/recording`)} />
            <div className="flex flex-wrap items-center gap-2 text-sm"><span className="text-muted">{fmtBytes(iv.recording_bytes)} · visible only to you</span>
              <a className="btn" href={api.mediaUrl(`/interviews/${interviewId}/recording`)} download={`interview-${interviewId}.webm`}><Download className="h-4 w-4" /> Download video</a>
              <button className="btn btn-danger" onClick={() => setConfirm("recording")}><Trash2 className="h-4 w-4" /> Delete recording</button></div>
          </>
        ) : <p className="text-sm text-muted">No recording is stored for this interview.</p>}
      </section>

      <section className="flex flex-col gap-3"><h2 className="text-xl font-bold">Answer-by-answer feedback</h2>
        {scored.map((q, i) => <AnswerCard key={q.id} q={q} n={i + 1} interviewId={interviewId} />)}</section>
      <p className="text-xs text-muted">Scores reflect the content and structure of your transcribed answers. Accent, grammar and speaking style are not penalized, and nothing about your personality or honesty is inferred from video or voice.</p>
      <div><Link to="/new" className="btn btn-primary">Practice again</Link></div>

      <ConfirmDialog open={confirm !== null} danger onCancel={() => setConfirm(null)} onConfirm={doDelete}
        title={confirm === "recording" ? "Delete the recording?" : "Delete this interview?"} confirmLabel="Delete"
        body={confirm === "recording" ? "The session video and every answer audio clip are permanently deleted. Transcripts, scores and the report stay." : "This permanently deletes the questions, answers, recordings and report."} />
    </div>
  );
}

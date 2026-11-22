import { ArrowRight, Camera, FileText, Mic, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";

const topics = ["Python OOP", "Exceptions", "SQL joins", "Subqueries", "GROUP BY", "Decision trees", "Random forest", "KNN", "Overfitting",
  "Metrics", "CNN", "LSTM", "Backpropagation", "Transformers", "Attention", "Embeddings", "Vector databases", "RAG", "LangChain",
  "LangGraph", "AI agents", "Fine-tuning", "Hallucinations", "Your projects", "Behavioral"];

export default function Landing() {
  const { user } = useAuth();
  const start = user ? "/new" : "/register";
  return (
    <div className="flex flex-col gap-14">
      <section className="grid items-center gap-9 pt-3 md:grid-cols-[1.1fr_1fr]">
        <div className="flex min-w-0 flex-col gap-4">
          <span className="eyebrow">Practice for AI/ML engineer roles</span>
          <h1 className="text-[clamp(30px,4.4vw,46px)] font-extrabold leading-[1.1]">Rehearse the interview your resume will actually get you.</h1>
          <p className="max-w-[52ch] text-lg text-muted">
            Upload your resume and the job description. An AI interviewer reads both, asks personalized questions out loud while your
            camera and microphone record, and scores every spoken answer with specific feedback.
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <Link to={start} className="btn btn-primary">Start a practice interview <ArrowRight className="h-4 w-4" /></Link>
            {user ? <Link to="/dashboard" className="btn">Open dashboard</Link> : <Link to="/login" className="btn">Sign in</Link>}
          </div>
        </div>
        <figure className="flex min-w-0 flex-col gap-3.5 rounded-2xl bg-stage p-6 text-stage-fg" aria-label="Example question and scoring">
          <span className="self-start rounded-full border border-white/15 px-2 py-0.5 text-[11px] uppercase tracking-wider text-stage-muted">Example · project question</span>
          <p className="font-display text-xl font-bold leading-snug">Your resume says DocuQuery splits policy PDFs into 800-token chunks with 100 overlap. How did you pick those numbers, and how would you check retrieval quality?</p>
          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1.5 text-[13px] text-stage-muted">
            {([["Technical accuracy", 7], ["Conceptual understanding", 8], ["Practical knowledge", 6], ["Communication", 8]] as const).map(([k, v]) => (
              <div key={k} className="contents"><span>{k}</span><i className="block h-1.5 overflow-hidden rounded-full bg-white/10"><b className="block h-full bg-[#5fd3b2]" style={{ width: `${v * 10}%` }} /></i><span className="font-mono">{v}/10</span></div>
            ))}
          </div>
          <figcaption className="text-[13px] text-stage-muted">Missing: a retrieval metric such as recall@k on a labelled question set.</figcaption>
        </figure>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-bold">How a session runs</h2>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [FileText, "Upload documents", "Resume and job description as PDF, DOCX or pasted text."],
            [ShieldCheck, "See the gap analysis", "Matching and missing skills, strengths, and the topics you are likely to be asked."],
            [Camera, "Interview on camera", "Questions are spoken one at a time. Answer out loud; your camera and microphone record with your consent."],
            [Mic, "Get scored", "Per-answer scores, mistakes, stronger example answers, category scores and a readiness verdict as PDF."],
          ].map(([Icon, t, d], i) => {
            const I = Icon as typeof FileText;
            return (
              <li key={i} className="flex flex-col gap-1.5 border-t-2 border-line pt-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-accent">Step {i + 1}</span>
                <h3 className="flex items-center gap-2 font-bold"><I className="h-4 w-4 text-accent" aria-hidden />{t as string}</h3>
                <p className="text-sm text-muted">{d as string}</p>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="panel flex flex-col gap-3"><h3 className="font-bold">Topics it can cover</h3>
          <div className="flex flex-wrap gap-1.5">{topics.map((t) => <span key={t} className="chip">{t}</span>)}</div></div>
        <div className="panel flex flex-col gap-3"><h3 className="font-bold">Privacy</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            <li>Recording starts only after you agree, and the recording indicator is always visible.</li>
            <li>Recordings and resumes are stored on this app's server and are visible only to your account.</li>
            <li>Delete a recording, an interview or your whole account at any time.</li>
            <li>Scores judge content only. Accent and speaking style are not penalized, and nothing is inferred from your face.</li>
          </ul></div>
      </section>
    </div>
  );
}

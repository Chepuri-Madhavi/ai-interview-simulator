import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { fmtDate } from "../lib/format";
import type { InterviewSummary } from "../lib/types";
import { ConfirmDialog, ScorePill } from "./ui";

const STATUS: Record<InterviewSummary["status"], [string, string]> = {
  ready: ["Not started", ""], live: ["In progress", "bg-warn-soft text-warn"], paused: ["Paused", "bg-warn-soft text-warn"],
  finished: ["Needs scoring", "bg-warn-soft text-warn"], scored: ["Report ready", "bg-good-soft text-good"],
};

export function InterviewList({ items, onDeleted }: { items: InterviewSummary[]; onDeleted: (id: number) => void }) {
  const [del, setDel] = useState<InterviewSummary | null>(null);
  if (!items.length) return <div className="panel text-muted">No interviews yet. Start one to see your scores here.</div>;
  return (
    <>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {items.map((s) => {
          const [label, cls] = STATUS[s.status];
          const href = ["finished", "scored"].includes(s.status) ? `/interviews/${s.id}/report` : s.status === "ready" ? `/interviews/${s.id}/check` : `/interviews/${s.id}/check`;
          return (
            <li key={s.id} className="flex flex-wrap items-center gap-3.5 px-4 py-3.5">
              <div className="min-w-0 flex-[1_1_240px]"><Link to={href} className="font-semibold hover:underline">{s.role_title}</Link>
                <div className="text-sm text-muted">{fmtDate(s.created_at)} · {s.interview_type} · {s.difficulty} · {s.language} · {s.answered}/{s.total_questions} answered</div></div>
              <span className={`chip ${cls}`}>{label}</span>
              <ScorePill value={s.overall} />
              <Link to={href} className="btn">{s.status === "scored" ? "View report" : s.status === "finished" ? "Score it" : "Continue"}</Link>
              <button className="btn btn-ghost btn-danger px-2.5" aria-label={`Delete interview from ${fmtDate(s.created_at)}`} onClick={() => setDel(s)}><Trash2 className="h-4 w-4" /></button>
            </li>
          );
        })}
      </ul>
      <ConfirmDialog open={!!del} danger title="Delete this interview?" confirmLabel="Delete" onCancel={() => setDel(null)}
        body="This permanently deletes the questions, transcribed answers, recordings and report for this interview."
        onConfirm={async () => { if (del) { await api.deleteInterview(del.id); onDeleted(del.id); } setDel(null); }} />
    </>
  );
}

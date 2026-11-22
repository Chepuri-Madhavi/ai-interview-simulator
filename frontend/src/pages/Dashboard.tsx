import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { InterviewList } from "../components/InterviewList";
import { Notice, PageHeader, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { AnalysisOut, InterviewSummary } from "../lib/types";

export default function Dashboard() {
  const { user } = useAuth();
  const [items, setItems] = useState<InterviewSummary[] | null>(null);
  const [analyses, setAnalyses] = useState<AnalysisOut[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.interviews().then(setItems).catch((e) => { setItems([]); setError(e.message); });
    api.analyses().then(setAnalyses).catch(() => {});
  }, []);
  const done = (items ?? []).filter((x) => x.overall != null);
  const avg = done.length ? Math.round(done.reduce((a, x) => a + (x.overall ?? 0), 0) / done.length) : null;
  const best = done.length ? Math.max(...done.map((x) => x.overall ?? 0)) : null;
  const latest = analyses[0];
  return (
    <div className="flex flex-col gap-7">
      <PageHeader eyebrow="Dashboard" title={`Welcome${user?.full_name ? `, ${user.full_name.split(" ")[0]}` : ""}`}>
        <Link to="/new" className="btn btn-primary">New interview <ArrowRight className="h-4 w-4" /></Link>
      </PageHeader>
      {error && <Notice kind="bad">{error}</Notice>}
      {items === null ? <Spinner /> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[["Interviews completed", String(done.length)], ["Average score", avg == null ? "—" : `${avg}%`], ["Best score", best == null ? "—" : `${best}%`],
            ["Latest readiness", done[0]?.readiness ?? "—"]].map(([k, v]) => (
            <div key={k} className="panel flex flex-col gap-1"><span className="eyebrow">{k}</span><b className="font-display text-2xl font-extrabold">{v}</b></div>
          ))}
        </div>
      )}
      {latest && (
        <section className="panel flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-lg font-bold">Latest analysis: {latest.result.job.title}</h2>
            <p className="text-sm text-muted">Match {latest.result.comparison.match_score}% · {latest.result.comparison.missing_skills.length} missing skills</p></div>
          <div className="flex gap-2"><Link className="btn" to={`/analysis/${latest.id}`}>View analysis</Link><Link className="btn btn-primary" to={`/analysis/${latest.id}/configure`}>Interview again</Link></div>
        </section>
      )}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between"><h2 className="text-xl font-bold">Recent interviews</h2>{(items?.length ?? 0) > 5 && <Link to="/history" className="text-sm font-semibold text-accent">See all</Link>}</div>
        {items && <InterviewList items={items.slice(0, 5)} onDeleted={(id) => setItems((xs) => xs?.filter((x) => x.id !== id) ?? null)} />}
      </section>
    </div>
  );
}

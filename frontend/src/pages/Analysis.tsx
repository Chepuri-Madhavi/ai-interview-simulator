import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Chips, Notice, PageHeader, ScoreRing, Spinner, Steps } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { CATEGORY_COLORS, CATEGORY_NAMES } from "../lib/constants";
import type { AnalysisOut } from "../lib/types";

export default function Analysis() {
  const { id } = useParams();
  const [a, setA] = useState<AnalysisOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.analysis(Number(id)).then(setA).catch((e) => setError(e instanceof ApiError ? e.message : "Could not load the analysis.")); }, [id]);
  if (error) return <Notice kind="bad">{error}</Notice>;
  if (!a) return <Spinner label="Loading analysis…" />;
  const { candidate: c, job: j, comparison: cmp } = a.result;
  const skillGroups: [string, string[]][] = [["Languages", c.skills.languages], ["Frameworks & libraries", c.skills.frameworks_libraries],
    ["ML / AI", c.skills.ml_ai], ["Data & SQL", c.skills.data_sql], ["Tools & cloud", c.skills.tools_cloud]];
  const exp = [...c.experience, ...c.internships];
  return (
    <div className="flex flex-col gap-6">
      <Steps current={2} />
      <PageHeader eyebrow="Resume vs job description" title={`${c.name ? `${c.name} → ` : ""}${j.title}`}>
        <Link to={`/analysis/${a.id}/configure`} className="btn btn-primary">Configure interview <ArrowRight className="h-4 w-4" /></Link>
      </PageHeader>
      <section className="panel flex flex-wrap items-center gap-6">
        <ScoreRing value={cmp.match_score} label="match" />
        <div className="flex min-w-0 flex-1 basis-72 flex-col gap-2">
          <h2 className="text-xl font-bold">Profile match: {cmp.match_score}%</h2>
          <p className="text-muted">{cmp.match_summary}</p>
          <p className="text-xs text-muted">An estimate of how well the resume covers this job's requirements, not a hiring prediction.</p>
        </div>
      </section>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="panel flex flex-col gap-3"><h3 className="font-bold">Matching skills</h3><Chips items={cmp.matching_skills} tone="good" /></section>
        <section className="panel flex flex-col gap-3"><h3 className="font-bold">Missing skills</h3><Chips items={cmp.missing_skills} tone="bad" empty="No obvious gaps." /></section>
        <section className="panel flex flex-col gap-3"><h3 className="font-bold">Resume strengths</h3><ul className="list-disc space-y-1 pl-5">{cmp.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></section>
        <section className="panel flex flex-col gap-3"><h3 className="font-bold">Areas to improve</h3><ul className="list-disc space-y-1 pl-5">{cmp.improvement_areas.map((s, i) => <li key={i}>{s}</li>)}</ul></section>
      </div>
      <section className="panel flex flex-col gap-3">
        <h3 className="font-bold">Topics likely to come up</h3>
        <ul className="divide-y divide-line">
          {cmp.likely_topics.map((t, i) => (
            <li key={i} className="flex flex-wrap items-start gap-3 py-2.5">
              <span className="chip" style={{ background: `${CATEGORY_COLORS[t.category]}22` }}>{CATEGORY_NAMES[t.category]}</span>
              <div className="min-w-0 flex-1"><strong>{t.topic}</strong><div className="text-sm text-muted">{t.reason}</div></div>
            </li>
          ))}
        </ul>
      </section>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="panel flex flex-col gap-4">
          <h3 className="font-bold">What your resume shows</h3>
          {skillGroups.filter(([, v]) => v.length).map(([k, v]) => <div key={k} className="flex flex-col gap-1.5"><span className="eyebrow">{k}</span><Chips items={v} /></div>)}
          {c.certifications.length > 0 && <div className="flex flex-col gap-1.5"><span className="eyebrow">Certifications</span><Chips items={c.certifications} /></div>}
          {c.education.length > 0 && <div className="flex flex-col gap-1.5"><span className="eyebrow">Education</span>
            {c.education.map((e, i) => <p key={i} className="text-sm">{[e.degree, e.institution, e.period].filter(Boolean).join(" · ")}</p>)}</div>}
        </section>
        <section className="panel flex flex-col gap-4">
          <h3 className="font-bold">What the job asks for</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted">Role</dt><dd>{j.title}</dd><dt className="text-muted">Company</dt><dd>{j.company || "—"}</dd>
            <dt className="text-muted">Experience</dt><dd>{j.experience_required || "—"}</dd></dl>
          <div className="flex flex-col gap-1.5"><span className="eyebrow">Required skills</span><Chips items={j.required_skills} /></div>
          {j.preferred_skills.length > 0 && <div className="flex flex-col gap-1.5"><span className="eyebrow">Nice to have</span><Chips items={j.preferred_skills} /></div>}
          <div className="flex flex-col gap-1.5"><span className="eyebrow">Responsibilities</span><ul className="list-disc space-y-1 pl-5 text-sm">{j.responsibilities.map((r, i) => <li key={i}>{r}</li>)}</ul></div>
        </section>
      </div>
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Projects and experience the interviewer will ask about</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {c.projects.map((p, i) => <div key={`p${i}`} className="panel flex flex-col gap-2"><span className="eyebrow">Project</span><h3 className="font-bold">{p.name}</h3><p className="text-sm text-muted">{p.summary}</p><Chips items={p.technologies} empty="" /></div>)}
          {exp.map((e, i) => <div key={`e${i}`} className="panel flex flex-col gap-2"><span className="eyebrow">Experience</span><h3 className="font-bold">{[e.role, e.organization].filter(Boolean).join(" · ")}</h3>
            <p className="text-sm text-muted">{e.period}</p><ul className="list-disc space-y-1 pl-5 text-sm">{e.highlights.map((h, k) => <li key={k}>{h}</li>)}</ul></div>)}
        </div>
      </section>
    </div>
  );
}

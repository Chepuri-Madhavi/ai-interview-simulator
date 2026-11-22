import { useNavigate, useSearchParams } from "react-router-dom";
import { DocumentStep } from "../components/DocumentStep";
import { Notice, Spinner, Steps } from "../components/ui";
import { useState } from "react";
import { api, ApiError } from "../lib/api";

export function ResumeUpload() {
  const nav = useNavigate();
  return (
    <div className="flex flex-col gap-6">
      <Steps current={0} />
      <div><h1 className="page-title">Upload your resume</h1>
        <p className="mt-1 text-muted">The interviewer uses only what your resume says. It never invents projects or experience.</p></div>
      <DocumentStep kind="resume" onSaved={(d) => nav(`/new/job?resume=${d.id}`)} />
    </div>
  );
}

export function JobUpload() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const resumeId = Number(params.get("resume"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<number | null>(null);

  async function analyze(job: number) {
    setJobId(job); setBusy(true); setError(null);
    try { const a = await api.analyze(resumeId, job); nav(`/analysis/${a.id}`); }
    catch (e) { setError(e instanceof ApiError ? e.message : "The analysis failed."); setBusy(false); }
  }
  if (!resumeId) return <Notice kind="warn">Upload your resume first. <a className="font-semibold underline" href="/new">Go to resume upload</a></Notice>;
  return (
    <div className="flex flex-col gap-6">
      <Steps current={1} />
      <div><h1 className="page-title">Add the job description</h1>
        <p className="mt-1 text-muted">Paste the posting or upload it. Questions will target what this job asks for.</p></div>
      {busy ? (
        <div className="panel"><Spinner label="Analyzing your resume against the job description…" />
          <p className="text-center text-sm text-muted">This usually takes 20–60 seconds.</p></div>
      ) : (
        <>
          {error && <Notice kind="bad">{error} {jobId && <button className="ml-2 font-semibold underline" onClick={() => analyze(jobId)}>Try again</button>}</Notice>}
          <DocumentStep kind="job" onSaved={(d) => analyze(d.id)} />
        </>
      )}
    </div>
  );
}

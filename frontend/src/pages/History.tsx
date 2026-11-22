import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { InterviewList } from "../components/InterviewList";
import { Notice, PageHeader, Spinner } from "../components/ui";
import { api } from "../lib/api";
import type { InterviewSummary } from "../lib/types";

export default function History() {
  const [items, setItems] = useState<InterviewSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.interviews().then(setItems).catch((e) => { setItems([]); setError(e.message); }); }, []);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="History" title="Past interviews"><Link to="/new" className="btn btn-primary">New interview</Link></PageHeader>
      {error && <Notice kind="bad">{error}</Notice>}
      {items === null ? <Spinner label="Loading your interviews…" /> : <InterviewList items={items} onDeleted={(id) => setItems((xs) => xs?.filter((x) => x.id !== id) ?? null)} />}
    </div>
  );
}

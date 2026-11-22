import { FileUp, Loader2 } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { DocumentOut } from "../lib/types";
import { Notice } from "./ui";

const ACCEPT = ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Upload a PDF/DOCX (extracted on the server) or paste text. Calls onSaved with the stored document. */
export function DocumentStep({ kind, onSaved, maxMb = 8 }: { kind: "resume" | "job"; onSaved: (d: DocumentOut) => void; maxMb?: number }) {
  const label = kind === "resume" ? "resume" : "job description";
  const [text, setText] = useState("");
  const [saved, setSaved] = useState<DocumentOut | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const [previous, setPrevious] = useState<DocumentOut[]>([]);
  useEffect(() => { api.documents(kind).then(setPrevious).catch(() => {}); }, [kind]);

  async function upload(file: File) {
    setError(null);
    const name = file.name.toLowerCase();
    if (!name.endsWith(".pdf") && !name.endsWith(".docx")) return setError("Upload a PDF or DOCX file.");
    if (file.size > maxMb * 1024 * 1024) return setError(`The file is larger than ${maxMb} MB.`);
    setBusy(`Extracting text from ${file.name}…`);
    try { const d = await api.uploadDocument(kind, file); setSaved(d); setText(d.text); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Upload failed."); }
    finally { setBusy(null); if (input.current) input.current.value = ""; }
  }
  async function savePasted() {
    setError(null); setBusy("Saving…");
    try { const d = await api.uploadDocument(kind, text); setSaved(d); onSaved(d); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Saving failed."); }
    finally { setBusy(null); }
  }
  async function useSample() {
    const s = await api.samples();
    setText(kind === "resume" ? s.resume : s.job); setSaved(null);
  }
  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) void upload(f); };
  const edited = saved && saved.text !== text;

  return (
    <div className="flex flex-col gap-4">
      <label htmlFor={`${kind}-file`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-[1.5px] border-dashed p-7 text-center ${over ? "border-accent bg-accent-soft" : "border-line bg-surface"}`}>
        {busy ? <Loader2 className="h-7 w-7 animate-spin text-accent" /> : <FileUp className="h-7 w-7 text-accent" aria-hidden />}
        <strong>{busy || `Upload your ${label}`}</strong>
        <span className="text-sm text-muted">PDF or DOCX, up to {maxMb} MB. Drop the file here or click to choose.</span>
        <input ref={input} id={`${kind}-file`} type="file" accept={ACCEPT} className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </label>
      {error && <Notice kind="bad">{error}</Notice>}
      {saved && !edited && <Notice kind="good">Extracted {saved.text.length.toLocaleString()} characters from {saved.filename}. Check the text below; edit it if anything is wrong.</Notice>}
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="label" htmlFor={`${kind}-text`}>{kind === "resume" ? "Resume text" : "Job description text"}</label>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-muted">{text.length.toLocaleString()} characters</span>
            <button type="button" className="btn btn-ghost min-h-0 px-2 py-1 text-accent" onClick={useSample}>Use sample</button>
          </div>
        </div>
        <textarea id={`${kind}-text`} className="input min-h-[220px] resize-y leading-relaxed" value={text} onChange={(e) => setText(e.target.value)}
          placeholder={kind === "resume" ? "Text from your resume appears here after upload, or paste it." : "Paste the job posting here, or upload a file."} />
      </div>
      {previous.length > 0 && !saved && !text && (
        <div className="flex flex-wrap items-center gap-2 text-sm"><span className="text-muted">Or reuse:</span>
          {previous.slice(0, 3).map((d) => <button key={d.id} className="chip hover:bg-line" onClick={() => { setSaved(d); setText(d.text); }}>{d.filename} · {new Date(d.created_at).toLocaleDateString()}</button>)}
        </div>
      )}
      <div className="flex justify-end">
        <button className="btn btn-primary" disabled={!!busy || text.trim().length < 150}
          onClick={() => (saved && !edited ? onSaved(saved) : savePasted())}>Continue</button>
      </div>
      {text.trim().length > 0 && text.trim().length < 150 && <p className="text-right text-xs text-muted">Add at least 150 characters.</p>}
    </div>
  );
}

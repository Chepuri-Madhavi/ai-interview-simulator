import { AlertCircle, CheckCircle2, Info, Loader2 } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { CATEGORY_COLORS, CATEGORY_NAMES } from "../lib/constants";
import { scoreTone } from "../lib/format";
import type { Category, Scores } from "../lib/types";

export function Notice({ kind = "info", children }: { kind?: "info" | "good" | "warn" | "bad"; children: ReactNode }) {
  const styles = { info: "bg-accent-soft text-fg", good: "bg-good-soft text-good", warn: "bg-warn-soft text-warn", bad: "bg-bad-soft text-bad" }[kind];
  const Icon = kind === "good" ? CheckCircle2 : kind === "info" ? Info : AlertCircle;
  return (
    <div role={kind === "bad" ? "alert" : "status"} className={`flex items-start gap-2.5 rounded-lg px-3.5 py-3 text-sm ${styles}`}>
      <Icon className="mt-0.5 h-4 w-4 flex-none" aria-hidden /> <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Spinner({ label, className = "" }: { label?: string; className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-3 py-8 text-muted ${className}`} aria-live="polite">
      <Loader2 className="h-5 w-5 animate-spin text-accent" aria-hidden /> {label && <span>{label}</span>}
    </div>
  );
}

export function Chips({ items, tone, empty = "None found." }: { items?: string[]; tone?: "good" | "bad" | "accent"; empty?: string }) {
  if (!items?.length) return <p className="text-sm text-muted">{empty}</p>;
  const cls = tone === "good" ? "bg-good-soft text-good" : tone === "bad" ? "bg-bad-soft text-bad" : tone === "accent" ? "bg-accent-soft text-accent" : "";
  return <div className="flex flex-wrap gap-1.5">{items.map((t, i) => <span key={i} className={`chip ${cls}`}>{t}</span>)}</div>;
}

export function ScoreRing({ value, label, size = 150 }: { value: number | null; label: string; size?: number }) {
  const r = 60, c = 2 * Math.PI * r, pct = value == null ? 0 : Math.max(0, Math.min(100, value));
  const tone = scoreTone(value);
  return (
    <svg viewBox="0 0 150 150" width={size} height={size} role="img" aria-label={`${label}: ${value ?? "not available"}%`} className="flex-none">
      <circle cx="75" cy="75" r={r} fill="none" stroke="rgb(var(--surface-2))" strokeWidth="12" />
      <circle cx="75" cy="75" r={r} fill="none" stroke={`rgb(var(--${tone === "muted" ? "line" : tone}))`} strokeWidth="12" strokeLinecap="round"
        strokeDasharray={`${(c * pct) / 100} ${c}`} transform="rotate(-90 75 75)" />
      <text x="75" y="80" textAnchor="middle" fontSize="32" fontWeight="800" fill="rgb(var(--fg))" fontFamily="Manrope, sans-serif">{value == null ? "—" : `${Math.round(pct)}%`}</text>
      <text x="75" y="102" textAnchor="middle" fontSize="12" fill="rgb(var(--muted))">{label}</text>
    </svg>
  );
}

export function ScorePill({ value, outOf = 100 }: { value: number | null; outOf?: number }) {
  const pct = value == null ? null : (value / outOf) * 100;
  const tone = scoreTone(pct);
  const cls = tone === "muted" ? "bg-surface2 text-muted" : `bg-${tone}-soft text-${tone}`;
  return <span className={`min-w-[58px] rounded-md px-2.5 py-1 text-center font-mono text-sm ${cls}`}>{value == null ? "—" : outOf === 100 ? `${value}%` : `${value}/${outOf}`}</span>;
}

/** Horizontal progress bars per category (0-100). */
export function CategoryBars({ scores, withCommunication = true }: { scores: Partial<Scores>; withCommunication?: boolean }) {
  const keys = [...(Object.keys(CATEGORY_NAMES) as Category[]), ...(withCommunication ? (["communication"] as const) : [])];
  return (
    <div className="flex flex-col gap-3">
      {keys.map((k) => {
        const v = scores[k] ?? null;
        const color = k === "communication" ? "rgb(var(--accent))" : CATEGORY_COLORS[k as Category];
        const name = k === "communication" ? "Communication" : CATEGORY_NAMES[k as Category];
        return (
          <div key={k} className="grid grid-cols-[110px_1fr_48px] items-center gap-3 text-sm sm:grid-cols-[150px_1fr_56px]">
            <span>{name}</span>
            <div className="h-3 overflow-hidden rounded-full bg-surface2" role="progressbar" aria-label={name} aria-valuenow={v ?? undefined} aria-valuemin={0} aria-valuemax={100}>
              {v != null && <div className="h-full rounded-full transition-all" style={{ width: `${v}%`, background: color }} />}
            </div>
            <span className="text-right font-mono text-xs">{v == null ? "n/a" : `${v}%`}</span>
          </div>
        );
      })}
    </div>
  );
}

export function Steps({ current }: { current: number }) {
  const names = ["Resume", "Job description", "Analysis", "Configure", "Device check", "Interview", "Report"];
  return (
    <ol className="flex flex-wrap gap-1.5 text-[13px]" aria-label="Progress">
      {names.map((n, i) => (
        <li key={n} aria-current={i === current ? "step" : undefined}
          className={`rounded-full px-2.5 py-1 ${i === current ? "bg-accent font-semibold text-accent-ink" : i < current ? "bg-accent-soft text-accent" : "bg-surface2 text-muted"}`}>{n}</li>
      ))}
    </ol>
  );
}

export function ConfirmDialog({ open, title, body, confirmLabel, danger, onConfirm, onCancel, busy }: {
  open: boolean; title: string; body: ReactNode; confirmLabel: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) d.showModal(); else if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onCancel={(e) => { e.preventDefault(); onCancel(); }}
      className="w-[min(440px,calc(100vw-32px))] rounded-2xl border border-line bg-surface p-6 text-fg backdrop:bg-black/50">
      <h2 className="text-xl font-bold">{title}</h2>
      <div className="mt-3 text-muted">{body}</div>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn" onClick={onCancel}>Cancel</button>
        <button className={`btn ${danger ? "border-bad bg-bad text-white hover:bg-bad" : "btn-primary"}`} onClick={onConfirm} disabled={busy}>{confirmLabel}</button>
      </div>
    </dialog>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1 className="page-title">{title}</h1></div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

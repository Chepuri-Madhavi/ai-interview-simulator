/** Small typed client for the FastAPI backend. The token lives in localStorage; requests go to /api (proxied in dev). */
import type { AnalysisOut, AnswerResult, DocumentOut, Interview, InterviewSummary, PublicConfig, User } from "./types";

const TOKEN_KEY = "ais.token";
export const tokenStore = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t: string | null) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ } },
};

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = tokenStore.get();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !(init.body instanceof Blob)) headers.set("Content-Type", "application/json");
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "Cannot reach the server. Check that the backend is running and try again.");
  }
  if (res.status === 401 && !path.startsWith("/auth/")) onUnauthorized();
  if (!res.ok) {
    let msg = `Request failed (${res.status}).`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") msg = body.detail;
      else if (Array.isArray(body.detail)) msg = body.detail.map((d: { msg: string }) => d.msg.replace(/^Value error, /, "")).join(" ");
    } catch { /* not JSON */ }
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") || "";
  return (ct.includes("application/json") ? res.json() : res.blob()) as Promise<T>;
}

const json = (body: unknown) => JSON.stringify(body);

export const api = {
  config: () => request<PublicConfig>("/config"),
  register: (email: string, password: string, full_name: string) =>
    request<{ access_token: string; user: User }>("/auth/register", { method: "POST", body: json({ email, password, full_name }) }),
  login: (email: string, password: string) =>
    request<{ access_token: string; user: User }>("/auth/login", { method: "POST", body: json({ email, password }) }),
  me: () => request<User>("/auth/me"),
  updateMe: (body: Partial<Pick<User, "full_name" | "preferences">>) => request<User>("/auth/me", { method: "PATCH", body: json(body) }),
  deleteMe: () => request<void>("/auth/me", { method: "DELETE" }),

  samples: () => request<{ resume: string; job: string }>("/samples"),
  uploadDocument: (kind: "resume" | "job", src: File | string) => {
    const fd = new FormData();
    fd.set("kind", kind);
    if (typeof src === "string") fd.set("text", src); else fd.set("file", src);
    return request<DocumentOut>("/documents", { method: "POST", body: fd });
  },
  documents: (kind?: string) => request<DocumentOut[]>(`/documents${kind ? `?kind=${kind}` : ""}`),
  analyze: (resume_id: number, job_id: number) => request<AnalysisOut>("/analyses", { method: "POST", body: json({ resume_id, job_id }) }),
  analysis: (id: number) => request<AnalysisOut>(`/analyses/${id}`),
  analyses: () => request<AnalysisOut[]>("/analyses"),

  createInterview: (body: { analysis_id: number; duration_minutes: number; difficulty: string; interview_type: string; language: string; question_count: number }) =>
    request<Interview>("/interviews", { method: "POST", body: json(body) }),
  interviews: () => request<InterviewSummary[]>("/interviews"),
  interview: (id: number) => request<Interview>(`/interviews/${id}`),
  start: (id: number) => request<Interview>(`/interviews/${id}/start`, { method: "POST", body: json({ consent: true }) }),
  pause: (id: number, elapsed_seconds: number) => request<Interview>(`/interviews/${id}/pause`, { method: "POST", body: json({ elapsed_seconds }) }),
  resume: (id: number) => request<Interview>(`/interviews/${id}/resume`, { method: "POST" }),
  finish: (id: number, elapsed_seconds: number) => request<Interview>(`/interviews/${id}/finish`, { method: "POST", body: json({ elapsed_seconds }) }),
  transcribe: (id: number, audio: Blob) => {
    const fd = new FormData(); fd.set("audio", audio, "answer.webm");
    return request<{ transcript: string }>(`/interviews/${id}/transcribe`, { method: "POST", body: fd });
  },
  submitAnswer: (id: number, a: { question_id: number; transcript: string; skipped: boolean; duration_seconds: number; elapsed_seconds: number; audio?: Blob | null }) => {
    const fd = new FormData();
    fd.set("question_id", String(a.question_id)); fd.set("transcript", a.transcript); fd.set("skipped", String(a.skipped));
    fd.set("duration_seconds", String(a.duration_seconds)); fd.set("elapsed_seconds", String(a.elapsed_seconds));
    if (a.audio && a.audio.size) fd.set("audio", a.audio, "answer.webm");
    return request<AnswerResult>(`/interviews/${id}/answers`, { method: "POST", body: fd });
  },
  uploadChunk: (id: number, index: number, chunk: Blob) => {
    const fd = new FormData(); fd.set("chunk", chunk, `chunk-${index}.webm`);
    return request<{ next_chunk: number; size_bytes: number }>(`/interviews/${id}/recording/chunks?index=${index}`, { method: "POST", body: fd });
  },
  completeRecording: (id: number) => request<{ size_bytes: number }>(`/interviews/${id}/recording/complete`, { method: "POST" }),
  deleteRecording: (id: number) => request<void>(`/interviews/${id}/recording`, { method: "DELETE" }),
  generateReport: (id: number) => request<Interview>(`/interviews/${id}/report`, { method: "POST" }),
  reportPdf: (id: number) => request<Blob>(`/interviews/${id}/report.pdf`),
  deleteInterview: (id: number) => request<void>(`/interviews/${id}`, { method: "DELETE" }),
  mediaUrl: (path: string) => `/api${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(tokenStore.get() || "")}`,
};

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

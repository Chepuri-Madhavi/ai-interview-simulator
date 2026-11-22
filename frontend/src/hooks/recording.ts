/** MediaRecorder helpers: the full-session video (uploaded in ordered chunks) and per-answer audio clips. */
import { useCallback, useRef, useState } from "react";
import { api } from "../lib/api";

function pickMime(kind: "video" | "audio") {
  const opts = kind === "video"
    ? ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"]
    : ["audio/webm;codecs=opus", "audio/webm", "audio/ogg", "audio/mp4"];
  return opts.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) || "";
}

export type RecState = "inactive" | "recording" | "paused" | "uploading" | "error";

/** Records the whole interview and uploads 5-second chunks in order, retrying failed uploads. */
export function useSessionRecorder(interviewId: number, startChunk = 0) {
  const rec = useRef<MediaRecorder | null>(null);
  const queue = useRef<Blob[]>([]);
  const next = useRef(startChunk);
  const pumping = useRef(false);
  const [state, setState] = useState<RecState>("inactive");
  const [uploaded, setUploaded] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const pump = useCallback(async () => {
    if (pumping.current) return;
    pumping.current = true;
    let failures = 0;
    while (queue.current.length) {
      try {
        const r = await api.uploadChunk(interviewId, next.current, queue.current[0]);
        queue.current.shift(); next.current = r.next_chunk; setUploaded(r.size_bytes); failures = 0; setError(null);
      } catch (e) {
        failures += 1;
        if (failures > 5) { setError("The recording could not be uploaded. Check your connection; the interview continues."); break; }
        await new Promise((res) => setTimeout(res, 1000 * failures));
      }
    }
    pumping.current = false;
  }, [interviewId]);

  const start = useCallback((stream: MediaStream) => {
    if (rec.current || typeof MediaRecorder === "undefined") return;
    try {
      const r = new MediaRecorder(stream, { mimeType: pickMime("video") || undefined, videoBitsPerSecond: 900_000 });
      r.ondataavailable = (e) => { if (e.data.size) { queue.current.push(e.data); void pump(); } };
      r.onerror = () => { setState("error"); setError("Recording stopped unexpectedly."); };
      r.start(5000);
      rec.current = r; setState("recording");
    } catch { setState("error"); setError("This browser cannot record video."); }
  }, [pump]);

  const pause = useCallback(() => { if (rec.current?.state === "recording") { rec.current.pause(); setState("paused"); } }, []);
  const resume = useCallback(() => { if (rec.current?.state === "paused") { rec.current.resume(); setState("recording"); } }, []);

  /** Stop recording, flush every chunk, and mark the upload complete. */
  const finish = useCallback(async () => {
    const r = rec.current;
    if (r && r.state !== "inactive") {
      await new Promise<void>((res) => { r.addEventListener("stop", () => res(), { once: true }); r.stop(); });
    }
    rec.current = null;
    setState("uploading");
    await new Promise((res) => setTimeout(res, 0));
    await pump();
    if (next.current > 0 && !queue.current.length) { try { await api.completeRecording(interviewId); } catch { /* best effort */ } }
    setState("inactive");
  }, [interviewId, pump]);

  return { state, uploaded, error, start, pause, resume, finish };
}

/** Records the audio of one answer (sent with the answer for storage and optional server transcription). */
export function useAnswerRecorder() {
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const start = useCallback((stream: MediaStream) => {
    if (rec.current?.state === "recording" || typeof MediaRecorder === "undefined") return;
    const audio = new MediaStream(stream.getAudioTracks());
    try {
      const r = new MediaRecorder(audio, { mimeType: pickMime("audio") || undefined });
      r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      r.start(1000);
      rec.current = r; startedAt.current = Date.now();
    } catch { rec.current = null; }
  }, []);
  /** Stops the current take; takes accumulate until `take()` collects them. */
  const stop = useCallback(async () => {
    const r = rec.current;
    if (r && r.state !== "inactive") await new Promise<void>((res) => { r.addEventListener("stop", () => res(), { once: true }); r.stop(); });
    rec.current = null;
  }, []);
  const take = useCallback(async () => {
    await stop();
    const blob = chunks.current.length ? new Blob(chunks.current, { type: chunks.current[0].type || "audio/webm" }) : null;
    const seconds = startedAt.current ? Math.round((Date.now() - startedAt.current) / 1000) : 0;
    chunks.current = []; startedAt.current = 0;
    return { blob, seconds };
  }, [stop]);
  return { start, stop, take };
}

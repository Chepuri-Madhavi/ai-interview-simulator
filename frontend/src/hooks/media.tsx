/**
 * Camera + microphone access (MediaDevices API), shared between the device check and the interview room
 * so the candidate grants permission once.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type MediaStatus = "idle" | "requesting" | "ready" | "denied" | "missing" | "busy" | "unsupported" | "error";

interface MediaState {
  stream: MediaStream | null; status: MediaStatus; error: string | null;
  hasVideo: boolean; hasAudio: boolean;
  request: () => Promise<MediaStream | null>; stop: () => void;
}
const Ctx = createContext<MediaState | null>(null);

function explain(e: unknown): [MediaStatus, string] {
  const name = (e as DOMException)?.name;
  if (name === "NotAllowedError" || name === "SecurityError")
    return ["denied", "Camera or microphone access was blocked. Click the camera icon in your browser's address bar, allow both, then press Try again."];
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return ["missing", "No camera or microphone was found. Connect both devices and press Try again."];
  if (name === "NotReadableError" || name === "AbortError")
    return ["busy", "Your camera or microphone is being used by another app (for example a video call). Close it and press Try again."];
  return ["error", "The camera and microphone could not be started. Press Try again."];
}

export function MediaProvider({ children }: { children: ReactNode }) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<MediaStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    ref.current?.getTracks().forEach((t) => t.stop());
    ref.current = null; setStream(null); setStatus("idle");
  }, []);

  const request = useCallback(async () => {
    if (ref.current?.active) return ref.current;
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      setError("This browser cannot access a camera. Use a recent Chrome, Edge or Firefox over HTTPS or localhost.");
      return null;
    }
    setStatus("requesting"); setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      if (!s.getVideoTracks().length || !s.getAudioTracks().length) {
        s.getTracks().forEach((t) => t.stop());
        throw Object.assign(new Error("missing"), { name: "NotFoundError" });
      }
      s.getTracks().forEach((t) => t.addEventListener("ended", () => { setStatus("error"); setError("A camera or microphone was disconnected. Reconnect it and press Try again."); }));
      ref.current = s; setStream(s); setStatus("ready");
      return s;
    } catch (e) {
      const [st, msg] = explain(e);
      setStatus(st); setError(msg);
      return null;
    }
  }, []);

  useEffect(() => () => ref.current?.getTracks().forEach((t) => t.stop()), []);
  const hasVideo = !!stream?.getVideoTracks().some((t) => t.readyState === "live");
  const hasAudio = !!stream?.getAudioTracks().some((t) => t.readyState === "live");
  return <Ctx.Provider value={{ stream, status, error, hasVideo, hasAudio, request, stop }}>{children}</Ctx.Provider>;
}

export function useMedia() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useMedia outside MediaProvider");
  return c;
}

/** Live microphone input level, 0..1, for the level meter. */
export function useAudioLevel(stream: MediaStream | null) {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!stream || !stream.getAudioTracks().length) return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    src.connect(an);
    const buf = new Uint8Array(an.fftSize);
    let raf = 0;
    const tick = () => {
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => { cancelAnimationFrame(raf); src.disconnect(); ctx.close().catch(() => {}); };
  }, [stream]);
  return level;
}

/** Browser speech: live speech-to-text (Web Speech API) and text-to-speech (speechSynthesis). */
import { useCallback, useEffect, useRef, useState } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Rec = any;
const SR: any = typeof window !== "undefined" ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : undefined;
export const speechRecognitionSupported = !!SR;

export type ListenState = "idle" | "listening" | "error";

export function useSpeechToText(lang: string, onFinal: (text: string) => void) {
  const rec = useRef<Rec>(null);
  const wanted = useRef(false);
  const finalCb = useRef(onFinal);
  finalCb.current = onFinal;
  const [state, setState] = useState<ListenState>("idle");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    wanted.current = false;
    try { rec.current?.stop(); } catch { /* already stopped */ }
    setInterim(""); setState("idle");
  }, []);

  const start = useCallback(() => {
    if (!SR) { setError("Live transcription needs Chrome or Edge. You can type or correct your answer instead."); setState("error"); return; }
    setError(null);
    const r: Rec = new SR();
    r.lang = lang; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
    r.onresult = (e: any) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalCb.current(res[0].transcript.trim());
        else live += res[0].transcript;
      }
      setInterim(live);
    };
    r.onerror = (e: any) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      const msg: Record<string, string> = {
        "not-allowed": "Speech recognition was blocked. Allow microphone access for this site.",
        "audio-capture": "No microphone was found for speech recognition.",
        network: "Speech recognition needs an internet connection in this browser. Type your answer, or check your connection.",
        "language-not-supported": "Speech recognition does not support this language in your browser.",
      };
      setError(msg[e.error] || `Speech recognition error: ${e.error}.`);
      wanted.current = false; setState("error");
    };
    // Chrome ends recognition after silence; restart while the candidate is still answering.
    r.onend = () => { if (wanted.current) { try { r.start(); } catch { /* ignore */ } } else setState("idle"); };
    rec.current = r; wanted.current = true;
    try { r.start(); setState("listening"); } catch { setState("error"); }
  }, [lang]);

  useEffect(() => () => { wanted.current = false; try { rec.current?.abort(); } catch { /* ignore */ } }, []);
  return { supported: speechRecognitionSupported, state, interim, error, start, stop };
}

export function useVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);
  return voices;
}

export function useTextToSpeech(opts: { lang: string; voiceName?: string; rate?: number }) {
  const [speaking, setSpeaking] = useState(false);
  const voices = useVoices();
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const speak = useCallback((text: string) => new Promise<void>((resolve) => {
    if (!supported || !text) return resolve();
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = opts.lang; u.rate = opts.rate ?? 1;
    const prefix = opts.lang.split("-")[0];
    u.voice = voices.find((v) => v.name === opts.voiceName && v.lang.startsWith(prefix))
      || voices.find((v) => v.lang === opts.lang) || voices.find((v) => v.lang.startsWith(prefix)) || null;
    u.onstart = () => setSpeaking(true);
    u.onend = u.onerror = () => { setSpeaking(false); resolve(); };
    window.speechSynthesis.speak(u);
  }), [opts.lang, opts.voiceName, opts.rate, voices, supported]);
  const cancel = useCallback(() => { if (supported) window.speechSynthesis.cancel(); setSpeaking(false); }, [supported]);
  useEffect(() => () => { if (supported) window.speechSynthesis.cancel(); }, [supported]);
  const hasVoiceForLang = voices.some((v) => v.lang.startsWith(opts.lang.split("-")[0]));
  return { supported, speaking, speak, cancel, voices, hasVoiceForLang };
}

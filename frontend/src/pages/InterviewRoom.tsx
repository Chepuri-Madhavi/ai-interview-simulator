import { ArrowRight, Camera, Mic, Pause, Play, RefreshCw, Square, User, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { LevelMeter, LiveVideo } from "../components/Video";
import { ConfirmDialog, Notice, Spinner } from "../components/ui";
import { useAudioLevel, useMedia } from "../hooks/media";
import { useAnswerRecorder, useSessionRecorder } from "../hooks/recording";
import { useSpeechToText, useTextToSpeech } from "../hooks/speech";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { CATEGORY_NAMES, SPEECH_LANG } from "../lib/constants";
import { fmtBytes, fmtClock } from "../lib/format";
import type { Interview, PublicConfig, Question } from "../lib/types";

const ACK_GREETING = { English: "Hello, and welcome. Let's begin.", Telugu: "నమస్కారం, ఇంటర్వ్యూ ప్రారంభిద్దాం." };

export default function InterviewRoom() {
  const { id } = useParams();
  const interviewId = Number(id);
  const nav = useNavigate();
  const { user } = useAuth();
  const media = useMedia();
  const level = useAudioLevel(media.stream);

  const [iv, setIv] = useState<Interview | null>(null);
  const [cfg, setCfg] = useState<PublicConfig | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [index, setIndex] = useState(0);
  const [total, setTotal] = useState(0);
  const [ack, setAck] = useState("");
  const [answer, setAnswer] = useState("");
  const [answering, setAnswering] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [paused, setPaused] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [finishing, setFinishing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const baseElapsed = useRef(0);
  const tickStart = useRef<number | null>(null);
  const greeted = useRef(false);

  const lang = iv?.language ?? "English";
  const prefs = user?.preferences ?? {};
  const autoSpeak = prefs.auto_speak !== false;
  const tts = useTextToSpeech({ lang: SPEECH_LANG[lang], voiceName: prefs.tts_voice, rate: prefs.tts_rate });
  const stt = useSpeechToText(SPEECH_LANG[lang], useCallback((t: string) => setAnswer((a) => (a ? `${a.trimEnd()} ${t}` : t)), []));
  const session = useSessionRecorder(interviewId, iv?.recording_next_chunk ?? 0);
  const clip = useAnswerRecorder();

  const elapsedNow = () => baseElapsed.current + (tickStart.current ? Math.floor((Date.now() - tickStart.current) / 1000) : 0);
  const startClock = () => { if (!tickStart.current) tickStart.current = Date.now(); };
  const stopClock = () => { baseElapsed.current = elapsedNow(); tickStart.current = null; };

  // Load the interview and the server config.
  useEffect(() => {
    Promise.all([api.interview(interviewId), api.config()]).then(([data, c]) => {
      setIv(data); setCfg(c);
      baseElapsed.current = data.elapsed_seconds; setElapsed(data.elapsed_seconds);
      setIndex(data.current_index); setTotal(data.total_questions);
      setQuestion(data.questions[data.current_index] ?? null);
      setPaused(data.status === "paused");
    }).catch((e) => setError(e instanceof ApiError ? e.message : "Could not load the interview."));
  }, [interviewId]);

  // Camera and microphone are mandatory: request them again after a page reload.
  useEffect(() => { if (iv && !media.stream && media.status === "idle") void media.request(); }, [iv, media]);

  // Start the clock and the session recording once devices and the interview are ready.
  const live = iv?.status === "live" && !paused;
  useEffect(() => {
    if (!iv || !media.stream || iv.status !== "live") return;
    session.start(media.stream);
    if (!paused) startClock();
    if (!greeted.current && question) {
      greeted.current = true;
      const greeting = iv.answered === 0 ? ACK_GREETING[lang] : "";
      setAck(greeting);
      if (autoSpeak) void tts.speak(`${greeting} ${question.text}`.trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iv, media.stream]);

  useEffect(() => {
    const t = setInterval(() => setElapsed(elapsedNow()), 500);
    return () => clearInterval(t);
  }, []);

  // Warn before leaving mid-interview.
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (iv?.status === "live" && !finishing) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [iv?.status, finishing]);

  function startAnswering() {
    if (!media.stream || !live) return;
    tts.cancel(); setError(null);
    clip.start(media.stream);
    if (!cfg?.server_transcription) stt.start();
    setAnswering(true);
  }
  async function stopAnswering() {
    stt.stop();
    setAnswering(false);
    if (cfg?.server_transcription) {
      await clip.stop();
      const { blob } = await clip.take();
      if (blob) {
        try { const r = await api.transcribe(interviewId, blob); setAnswer((a) => (a ? `${a} ${r.transcript}` : r.transcript)); }
        catch (e) { setError(e instanceof ApiError ? e.message : "Transcription failed. Type your answer instead."); }
      }
    } else {
      await clip.stop();
    }
  }

  async function finishInterview(viaEnd: boolean) {
    stt.stop(); tts.cancel(); stopClock();
    setFinishing("Saving your recording…");
    await session.finish();
    if (viaEnd) {
      try { await api.finish(interviewId, elapsedNow()); } catch { /* the report page can still finish it */ }
    }
    media.stop();
    nav(`/interviews/${interviewId}/report`);
  }

  async function submit(skipped: boolean) {
    if (!question || submitting) return;
    if (!skipped && !answer.trim()) { setError("No answer yet. Press Start answering and speak, or skip this question."); return; }
    setSubmitting(true); setError(null);
    if (answering) { stt.stop(); setAnswering(false); }
    const { blob, seconds } = await clip.take();
    try {
      const r = await api.submitAnswer(interviewId, {
        question_id: question.id, transcript: skipped ? "" : answer.trim(), skipped, duration_seconds: seconds,
        elapsed_seconds: elapsedNow(), audio: blob,
      });
      setAnswer("");
      if (r.finished || !r.next_question) { setSubmitting(false); await finishInterview(false); return; }
      setQuestion(r.next_question); setIndex(r.current_index); setTotal(r.total_questions); setAck(r.acknowledgement);
      if (autoSpeak) void tts.speak(`${r.acknowledgement} ${r.next_question.text}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Your answer could not be saved. Try again.");
    } finally { setSubmitting(false); }
  }

  async function togglePause() {
    if (!iv) return;
    if (!paused) {
      stt.stop(); setAnswering(false); await clip.stop(); tts.cancel(); stopClock(); session.pause(); setPaused(true);
      api.pause(interviewId, elapsedNow()).catch(() => {});
    } else {
      try { await api.resume(interviewId); } catch { /* retry on next action */ }
      setPaused(false); startClock(); session.resume();
    }
  }

  if (error && !iv) return <Notice kind="bad">{error}</Notice>;
  if (!iv) return <Spinner label="Loading interview…" />;
  if (["finished", "scored"].includes(iv.status)) return <Notice kind="info">This interview has finished. <Link className="font-semibold underline" to={`/interviews/${interviewId}/report`}>Open the report</Link></Notice>;
  if (iv.status === "ready") return <Notice kind="warn">Complete the device check before starting. <Link className="font-semibold underline" to={`/interviews/${interviewId}/check`}>Go to device check</Link></Notice>;
  if (finishing) return <div className="panel"><Spinner label={finishing} /><p className="text-center text-sm text-muted">Uploaded {fmtBytes(session.uploaded)} of video.</p></div>;

  const devicesMissing = !media.stream;
  const durationSec = iv.duration_minutes * 60;
  const timeUp = elapsed > durationSec;
  const recOn = session.state === "recording";
  const isLast = index >= total - 1;

  return (
    <div className="flex flex-col gap-3.5">
      {/* Top: progress and time */}
      <header className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-surface px-4 py-3">
        <div className="min-w-0"><div className="font-semibold">{iv.role_title}</div><div className="text-sm text-muted">{iv.interview_type} · {iv.difficulty} · {lang}</div></div>
        <div className="flex min-w-[180px] flex-1 flex-col gap-1.5">
          <span className="text-sm text-muted">Question {index + 1} of {total}</span>
          <div className="h-2 overflow-hidden rounded-full bg-surface2" role="progressbar" aria-valuenow={index} aria-valuemin={0} aria-valuemax={total} aria-label="Interview progress">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(index / Math.max(1, total)) * 100}%` }} /></div>
        </div>
        <span className={`font-mono text-lg ${timeUp ? "text-bad" : ""}`} aria-label="Elapsed time">{fmtClock(elapsed)} / {fmtClock(durationSec)}</span>
        <button className="btn" onClick={togglePause} disabled={devicesMissing}>{paused ? <><Play className="h-4 w-4" /> Resume</> : <><Pause className="h-4 w-4" /> Pause</>}</button>
        <button className="btn btn-danger" onClick={() => setConfirmEnd(true)}>End interview</button>
      </header>

      {timeUp && <Notice kind="warn">Time is up. Finish this answer, then end the interview to get your report.</Notice>}
      {devicesMissing && (
        <Notice kind="bad">
          Camera and microphone are required to continue. {media.error || "Allow access when your browser asks."}
          <button className="ml-2 inline-flex items-center gap-1 font-semibold underline" onClick={() => media.request()}><RefreshCw className="h-3.5 w-3.5" /> Try again</button>
        </Notice>
      )}

      <div className="grid gap-3.5 md:grid-cols-[1.25fr_1fr]">
        {/* Left: interviewer and question */}
        <section aria-label="Interviewer" className="flex min-h-[340px] min-w-0 flex-col gap-4 rounded-2xl bg-stage p-6 text-stage-fg">
          <div className="flex items-center gap-3">
            <div className={`relative grid h-12 w-12 flex-none place-items-center rounded-full bg-[#1f3a31] ${tts.speaking ? "after:absolute after:-inset-1.5 after:animate-ping after:rounded-full after:border-2 after:border-[#5fd3b2]" : ""}`}>
              <User className="h-6 w-6 text-[#7fe0c3]" aria-hidden /></div>
            <div><div className="font-semibold">AI Interviewer</div><div className="text-sm text-stage-muted">{tts.speaking ? "Speaking…" : answering ? "Listening…" : "Senior AI/ML engineer"}</div></div>
          </div>
          {question && <div className="flex flex-wrap gap-2">
            <span className="chip bg-white/10 text-stage-fg">{CATEGORY_NAMES[question.category]}{question.topic ? ` · ${question.topic}` : ""}</span>
            {question.followup_of_id && <span className="chip bg-white/10 text-stage-fg">Follow-up</span>}</div>}
          {ack && <p className="text-sm text-stage-muted">{ack}</p>}
          <p className="font-display text-[clamp(19px,2.3vw,24px)] font-bold leading-snug" aria-live="polite" id="question-text">{question?.text}</p>
          <div className="mt-auto flex flex-wrap items-center gap-3">
            {tts.supported && <button className="btn border-white/15 bg-white/5 text-stage-fg hover:bg-white/10" onClick={() => question && tts.speak(question.text)}><Volume2 className="h-4 w-4" /> Repeat question</button>}
            <span className="text-xs text-stage-muted">Expected answers are never shown during the interview.</span>
          </div>
        </section>

        {/* Right: candidate camera */}
        <section aria-label="You" className="flex min-w-0 flex-col gap-3">
          <div className="relative grid aspect-[4/3] max-w-full place-items-center overflow-hidden rounded-2xl bg-stage text-stage-muted">
            {media.stream ? <LiveVideo stream={media.stream} /> : <Camera className="h-8 w-8" />}
            {recOn && <span className="absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-1 text-xs font-semibold text-white"><span className="h-2 w-2 animate-pulse rounded-full bg-rec" /> REC</span>}
          </div>
          <div className="panel flex flex-col gap-2 p-3.5 text-sm">
            <div className="flex items-center gap-2"><Mic className="h-4 w-4 text-muted" />
              {media.hasAudio ? <>Microphone on <LevelMeter level={level} /></> : <span className="text-bad">Microphone off</span>}</div>
            <div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${recOn ? "animate-pulse bg-rec" : "bg-line"}`} />
              {recOn ? `Recording video and audio · ${fmtBytes(session.uploaded)} uploaded` : paused ? "Recording paused" : session.state === "error" ? "Recording stopped" : "Not recording"}</div>
            <div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${answering ? "animate-pulse bg-accent" : "bg-line"}`} />
              {answering ? (cfg?.server_transcription ? "Recording your answer (transcribed when you stop)" : "Transcribing your answer live") : "Not transcribing"}</div>
            {session.error && <Notice kind="warn">{session.error}</Notice>}
          </div>
        </section>
      </div>

      {/* Bottom: answer controls */}
      <section aria-label="Your answer" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="answer" className="label">Your answer: review and correct the transcript before submitting</label>
          <button className="btn btn-ghost min-h-0 px-2 py-1" onClick={() => setAnswer("")} disabled={submitting}>Clear</button>
        </div>
        <textarea id="answer" className="input min-h-[130px] resize-y" value={answer} onChange={(e) => setAnswer(e.target.value)}
          placeholder={stt.supported || cfg?.server_transcription ? "Press Start answering and speak. Your words appear here; you can fix transcription mistakes." : "Live transcription needs Chrome or Edge. Speak your answer (it is recorded) and type it here."} />
        {answering && stt.interim && <p className="text-sm italic text-muted" aria-live="polite">{stt.interim}</p>}
        {stt.error && <Notice kind="warn">{stt.error}</Notice>}
        {error && <Notice kind="bad">{error}</Notice>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {answering
              ? <button className="btn btn-rec" onClick={stopAnswering}><Square className="h-4 w-4" /> Stop answering</button>
              : <button id="answer-btn" className="btn btn-primary" onClick={startAnswering} disabled={!live || devicesMissing || submitting}><Mic className="h-4 w-4" /> {answer ? "Continue answering" : "Start answering"}</button>}
            <button className="btn" onClick={() => submit(true)} disabled={!live || submitting}>Skip question</button>
          </div>
          <button id="submit-btn" className={`btn ${answering ? "" : "btn-primary"}`} onClick={() => submit(false)} disabled={!live || submitting || devicesMissing}>
            {submitting ? "Saving…" : isLast ? "Submit and finish" : "Submit answer"} {!submitting && <ArrowRight className="h-4 w-4" />}</button>
        </div>
      </section>

      {paused && (
        <div className="fixed inset-0 z-20 grid place-items-center bg-black/50 p-4">
          <div role="dialog" aria-modal="true" aria-label="Interview paused" className="flex w-full max-w-md flex-col gap-3 rounded-2xl border border-line bg-surface p-6">
            <h2 className="text-xl font-bold">Interview paused</h2>
            <p className="text-muted">The timer and recording are paused. Resume when you are ready.</p>
            <div className="flex justify-end"><button className="btn btn-primary" onClick={togglePause}><Play className="h-4 w-4" /> Resume</button></div>
          </div>
        </div>
      )}
      <ConfirmDialog open={confirmEnd} title="End the interview now?" confirmLabel="End and get report" onCancel={() => setConfirmEnd(false)}
        onConfirm={() => { setConfirmEnd(false); void finishInterview(true); }}
        body={iv.answered + index > 0 ? `Unanswered questions are left out of your report. Text in the answer box that you have not submitted will be discarded.` : "You have not submitted any answers yet, so there will be nothing to score."} />
    </div>
  );
}

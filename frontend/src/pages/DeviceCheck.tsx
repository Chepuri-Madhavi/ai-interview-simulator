import { Camera, Mic, Play, RefreshCw, Square, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { LevelMeter, LiveVideo } from "../components/Video";
import { Notice, Spinner, Steps } from "../components/ui";
import { useAudioLevel, useMedia } from "../hooks/media";
import { useTextToSpeech } from "../hooks/speech";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { SPEECH_LANG } from "../lib/constants";
import type { Interview } from "../lib/types";

export default function DeviceCheck() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const media = useMedia();
  const level = useAudioLevel(media.stream);
  const [iv, setIv] = useState<Interview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [heard, setHeard] = useState(false);
  const [testClip, setTestClip] = useState<string | null>(null);
  const [recordingTest, setRecordingTest] = useState(false);
  const [starting, setStarting] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const lang = iv?.language ?? "English";
  const tts = useTextToSpeech({ lang: SPEECH_LANG[lang], voiceName: user?.preferences.tts_voice, rate: user?.preferences.tts_rate });

  useEffect(() => { api.interview(Number(id)).then(setIv).catch((e) => setError(e.message)); }, [id]);
  useEffect(() => { if (level > 0.15) setHeard(true); }, [level]);
  useEffect(() => () => { if (testClip) URL.revokeObjectURL(testClip); }, [testClip]);

  function recordTest() {
    if (!media.stream) return;
    const chunks: Blob[] = [];
    const r = new MediaRecorder(media.stream);
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    r.onstop = () => { setTestClip(URL.createObjectURL(new Blob(chunks, { type: r.mimeType || "video/webm" }))); setRecordingTest(false); };
    r.start(); recRef.current = r; setRecordingTest(true);
    setTimeout(() => { if (r.state !== "inactive") r.stop(); }, 5000);
  }

  const devicesOk = media.status === "ready" && media.hasVideo && media.hasAudio;
  const canStart = devicesOk && consent && heard && iv && ["ready", "live", "paused"].includes(iv.status);

  async function start() {
    if (!canStart) return;
    setStarting(true);
    try { await api.start(Number(id)); nav(`/interviews/${id}/room`); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Could not start the interview."); setStarting(false); }
  }

  if (!iv && !error) return <Spinner label="Loading…" />;
  if (iv && ["finished", "scored"].includes(iv.status)) return <Notice kind="info">This interview has finished. <Link className="font-semibold underline" to={`/interviews/${id}/report`}>Open the report</Link></Notice>;

  return (
    <div className="flex flex-col gap-6">
      <Steps current={4} />
      <div><h1 className="page-title">Check your camera and microphone</h1>
        {iv && <p className="mt-1 text-muted">{iv.total_questions} questions · {iv.duration_minutes} minutes · {iv.difficulty} · {iv.interview_type} · {iv.language}</p>}</div>
      {error && <Notice kind="bad">{error}</Notice>}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="panel flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-lg font-bold"><Camera className="h-5 w-5 text-accent" /> Camera and microphone <span className="text-sm font-normal text-muted">(required)</span></h2>
          <div className="relative grid aspect-video max-w-full place-items-center overflow-hidden rounded-xl bg-stage text-stage-muted">
            {media.stream ? <LiveVideo stream={media.stream} /> : media.status === "requesting" ? <Spinner label="Waiting for permission…" /> : <Camera className="h-8 w-8" />}
          </div>
          {media.error && <Notice kind="bad">{media.error}</Notice>}
          {media.status !== "ready" ? (
            <button className="btn btn-primary self-start" onClick={() => media.request()} disabled={media.status === "requesting"}>
              {media.status === "idle" ? <><Camera className="h-4 w-4" /> Allow camera and microphone</> : <><RefreshCw className="h-4 w-4" /> Try again</>}
            </button>
          ) : (
            <ul className="flex flex-col gap-1.5 text-sm">
              <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-good" /> Camera on</li>
              <li className="flex items-center gap-3"><span className={`h-2.5 w-2.5 rounded-full ${heard ? "bg-good" : "bg-warn"}`} />
                {heard ? "Microphone working" : "Say something to test your microphone"} <LevelMeter level={level} /></li>
            </ul>
          )}
        </section>

        <section className="panel flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-lg font-bold"><Mic className="h-5 w-5 text-accent" /> Check quality</h2>
          <p className="text-sm text-muted">Record a 5-second test clip and play it back to check your lighting, framing and audio. The test clip is not uploaded.</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={recordTest} disabled={!devicesOk || recordingTest}>
              {recordingTest ? <><Square className="h-4 w-4 text-rec" /> Recording 5 s…</> : <><Play className="h-4 w-4" /> Record test clip</>}</button>
            <button className="btn" disabled={!tts.supported}
              onClick={() => tts.speak(lang === "Telugu" ? "నమస్కారం. మీకు నా మాట స్పష్టంగా వినిపిస్తోందా?" : "Hello. Can you hear me clearly?")}>
              <Volume2 className="h-4 w-4" /> Test interviewer voice</button>
          </div>
          {testClip && <video src={testClip} controls className="aspect-video w-full rounded-lg bg-stage" aria-label="Test clip playback" />}
          {!tts.supported && <Notice kind="warn">This browser cannot read questions aloud. Questions will be shown on screen.</Notice>}
          {tts.supported && lang === "Telugu" && !tts.hasVoiceForLang && <Notice kind="warn">No Telugu voice is installed on this device, so Telugu questions may be read in a default voice. Add a Telugu voice in your OS speech settings.</Notice>}
        </section>
      </div>

      <section className="panel flex flex-col gap-3">
        <h2 className="text-lg font-bold">Recording and privacy</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm">
          <li><strong>What is recorded:</strong> video and audio from your camera and microphone for the whole interview, plus an audio clip of each answer. A red indicator shows whenever recording is on.</li>
          <li><strong>Where it is stored:</strong> on this application's server, in a private folder linked to your account, uploaded while you answer.</li>
          <li><strong>Who can access it:</strong> only you, when signed in. It is never shared. Whoever operates this server has technical access to its storage.</li>
          <li><strong>What the AI sees:</strong> only the text of your answers is sent to the AI for scoring. Video is never analyzed, and nothing is inferred from your face or voice.</li>
          <li><strong>Deleting:</strong> delete the recording, the whole interview, or your account at any time from the report page, History or Settings.</li>
        </ul>
        <label className="mt-1 flex items-start gap-2.5 font-medium">
          <input id="consent" type="checkbox" className="mt-1 h-4 w-4 accent-[rgb(var(--accent))]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          I agree to have my video and audio recorded and stored for this interview as described above.
        </label>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link className="btn" to="/history">Not now</Link>
        <div className="flex flex-wrap items-center gap-3">
          {!canStart && <span className="text-sm text-muted">{!devicesOk ? "Allow your camera and microphone to continue." : !heard ? "Speak to confirm your microphone works." : !consent ? "Agree to recording to continue." : ""}</span>}
          <button id="start-interview" className="btn btn-primary" disabled={!canStart || starting} onClick={start}>
            {iv?.status === "ready" ? "Start interview" : "Resume interview"}</button>
        </div>
      </div>
    </div>
  );
}

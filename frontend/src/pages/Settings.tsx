import { Play } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ConfirmDialog, Notice, PageHeader } from "../components/ui";
import { useTextToSpeech } from "../hooks/speech";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { Preferences } from "../lib/types";

export default function Settings() {
  const { user, setUser, signOut } = useAuth();
  const nav = useNavigate();
  const [prefs, setPrefs] = useState<Preferences>({ auto_speak: true, tts_rate: 1, default_language: "English", theme: "system", ...user?.preferences });
  const [name, setName] = useState(user?.full_name ?? "");
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const tts = useTextToSpeech({ lang: "en-IN", voiceName: prefs.tts_voice, rate: prefs.tts_rate });
  const english = tts.voices.filter((v) => v.lang.startsWith("en"));

  async function save() {
    setError(null);
    try { setUser(await api.updateMe({ full_name: name, preferences: prefs })); setSaved("Settings saved."); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Saving failed."); }
  }
  const set = (p: Partial<Preferences>) => { setPrefs((x) => ({ ...x, ...p })); setSaved(null); };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Settings" title="Preferences" />
      <section className="panel grid gap-5 md:grid-cols-2">
        <div className="flex flex-col gap-1.5"><label className="label" htmlFor="name">Name</label><input id="name" className="input" value={name} onChange={(e) => { setName(e.target.value); setSaved(null); }} /></div>
        <div className="flex flex-col gap-1.5"><label className="label" htmlFor="lang">Default interview language</label>
          <select id="lang" className="input" value={prefs.default_language} onChange={(e) => set({ default_language: e.target.value })}><option>English</option><option>Telugu</option></select></div>
        <div className="flex flex-col gap-1.5"><label className="label" htmlFor="voice">Interviewer voice (English)</label>
          <select id="voice" className="input" value={prefs.tts_voice ?? ""} onChange={(e) => set({ tts_voice: e.target.value || undefined })}>
            <option value="">Browser default</option>{english.map((v) => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}</select></div>
        <div className="flex flex-col gap-1.5"><div className="flex justify-between"><label className="label" htmlFor="rate">Speaking speed</label><span className="font-mono">{prefs.tts_rate?.toFixed(2)}×</span></div>
          <input id="rate" type="range" min={0.7} max={1.5} step={0.05} value={prefs.tts_rate} onChange={(e) => set({ tts_rate: Number(e.target.value) })} className="accent-[rgb(var(--accent))]" /></div>
        <div className="flex flex-col gap-1.5"><label className="label" htmlFor="theme">Appearance</label>
          <select id="theme" className="input" value={prefs.theme} onChange={(e) => set({ theme: e.target.value })}><option value="system">Match system</option><option value="light">Light</option><option value="dark">Dark</option></select></div>
        <label className="flex items-start gap-2.5 self-end"><input type="checkbox" className="mt-1 h-4 w-4" checked={prefs.auto_speak !== false} onChange={(e) => set({ auto_speak: e.target.checked })} />
          <span><strong>Read questions aloud automatically</strong><br /><span className="text-sm text-muted">Off: questions are shown, and Repeat question reads them.</span></span></label>
        <div className="flex flex-wrap items-center gap-2 md:col-span-2">
          <button className="btn btn-primary" onClick={save}>Save settings</button>
          <button className="btn" onClick={() => tts.speak("This is how your interviewer will sound.")} disabled={!tts.supported}><Play className="h-4 w-4" /> Preview voice</button>
          {saved && <span className="text-sm text-good">{saved}</span>}
        </div>
        {error && <div className="md:col-span-2"><Notice kind="bad">{error}</Notice></div>}
      </section>
      <section className="panel flex flex-col gap-3">
        <h2 className="text-lg font-bold">Your data</h2>
        <p className="text-sm text-muted">Signed in as {user?.email}. Resumes, job descriptions, transcripts, reports and recordings are stored on this app's server and are visible only to your account. Delete single interviews or recordings from History and each report.</p>
        <div><button className="btn btn-danger" onClick={() => setConfirm(true)}>Delete my account and all data</button></div>
      </section>
      <ConfirmDialog open={confirm} danger title="Delete your account?" confirmLabel="Delete everything" onCancel={() => setConfirm(false)}
        body="This permanently deletes your account, documents, interviews, reports and every recording. It cannot be undone."
        onConfirm={async () => { await api.deleteMe(); signOut(); nav("/"); }} />
    </div>
  );
}

import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Notice } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";

export default function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { signIn } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = mode === "login" ? await api.login(email, password) : await api.register(email, password, name);
      signIn(r.access_token, r.user);
      const next = params.get("next");
      nav(next && next.startsWith("/") ? next : "/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 pt-6">
      <h1 className="page-title">{mode === "login" ? "Sign in" : "Create your account"}</h1>
      <p className="text-muted">{mode === "login" ? "Continue your interview practice." : "Your resumes, recordings and reports are private to your account."}</p>
      <form onSubmit={submit} className="panel flex flex-col gap-4">
        {mode === "register" && (
          <div className="flex flex-col gap-1.5"><label className="label" htmlFor="name">Name</label>
            <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></div>
        )}
        <div className="flex flex-col gap-1.5"><label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></div>
        <div className="flex flex-col gap-1.5"><label className="label" htmlFor="password">Password</label>
          <input id="password" type="password" required minLength={8} className="input" value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"} />
          {mode === "register" && <span className="text-xs text-muted">At least 8 characters.</span>}</div>
        {error && <Notice kind="bad">{error}</Notice>}
        <button className="btn btn-primary" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button>
      </form>
      <p className="text-sm text-muted">
        {mode === "login" ? <>No account yet? <Link to="/register" className="font-semibold text-accent">Create one</Link></> : <>Already registered? <Link to="/login" className="font-semibold text-accent">Sign in</Link></>}
      </p>
    </div>
  );
}

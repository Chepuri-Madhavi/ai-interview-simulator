import { Activity, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Spinner } from "./ui";

export function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5 font-display text-base font-extrabold">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent"><Activity className="h-4 w-4 text-white" aria-hidden /></span>
      AI Interview Simulator
    </Link>
  );
}

const nav = [["/dashboard", "Dashboard"], ["/new", "New interview"], ["/history", "History"], ["/settings", "Settings"]] as const;

export function Layout() {
  const { user, signOut } = useAuth();
  const [testMode, setTestMode] = useState(false);
  useEffect(() => { api.config().then((c) => setTestMode(c.test_mode)).catch(() => {}); }, []);
  return (
    <div className="min-h-screen">
      {testMode && <div className="bg-warn-soft px-4 py-1.5 text-center text-xs font-semibold text-warn">TEST MODE: the server uses canned AI responses (LLM_PROVIDER=fake). Set an Anthropic API key for real interviews.</div>}
      <header className="sticky top-0 z-10 border-b border-line bg-surface">
        <div className="mx-auto flex min-h-14 max-w-6xl flex-wrap items-center gap-4 px-4">
          <Brand />
          {user && (
            <nav className="ml-auto flex flex-wrap items-center gap-1" aria-label="Main">
              {nav.map(([to, label]) => (
                <NavLink key={to} to={to} className={({ isActive }) => `rounded-lg px-2.5 py-1.5 text-sm font-medium ${isActive ? "bg-surface2 text-fg" : "text-muted hover:bg-surface2 hover:text-fg"}`}>{label}</NavLink>
              ))}
              <button className="btn btn-ghost min-h-0 px-2.5 py-1.5 font-medium text-muted" onClick={signOut} aria-label="Sign out"><LogOut className="h-4 w-4" /></button>
            </nav>
          )}
          {!user && <div className="ml-auto flex gap-2"><Link className="btn btn-ghost" to="/login">Sign in</Link><Link className="btn btn-primary" to="/register">Create account</Link></div>}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-7"><Outlet /></main>
    </div>
  );
}

export function RequireAuth() {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Spinner label="Loading…" />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  return <Outlet />;
}

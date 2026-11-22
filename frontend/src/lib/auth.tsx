import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setUnauthorizedHandler, tokenStore } from "./api";
import type { User } from "./types";

interface AuthState { user: User | null; loading: boolean; signIn: (token: string, user: User) => void; signOut: () => void; setUser: (u: User) => void }
const AuthContext = createContext<AuthState | null>(null);

export function applyTheme(theme?: string) {
  const root = document.documentElement;
  if (!theme || theme === "system") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", theme);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!tokenStore.get());
  const signOut = useCallback(() => { tokenStore.set(null); setUser(null); }, []);
  useEffect(() => { setUnauthorizedHandler(signOut); }, [signOut]);
  useEffect(() => {
    if (!tokenStore.get()) return;
    api.me().then(setUser).catch(() => tokenStore.set(null)).finally(() => setLoading(false));
  }, []);
  useEffect(() => { applyTheme(user?.preferences?.theme); }, [user?.preferences?.theme]);
  const signIn = (token: string, u: User) => { tokenStore.set(token); setUser(u); };
  return <AuthContext.Provider value={{ user, loading, signIn, signOut, setUser }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}

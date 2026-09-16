import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type * as React from "react";
import { api, type Role, type Session } from "./api";

interface AuthValue { session: Session | null; ready: boolean; signIn: (data: { email: string; password: string; role: Role }) => Promise<Session>; register: (data: { name: string; email: string; password: string; role: Role }) => Promise<Session>; signOut: () => void; startDemo: (role: Role) => Session }
// Keep one context instance across hot reloads so provider and consumers never mismatch.
const g = globalThis as { __supplyAuthContext?: React.Context<AuthValue | null> };
const AuthContext = g.__supplyAuthContext ?? (g.__supplyAuthContext = createContext<AuthValue | null>(null));
const KEY = "supply-chain-session";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { try { setSession(JSON.parse(localStorage.getItem(KEY) ?? "null") as Session | null); } catch { localStorage.removeItem(KEY); } finally { setReady(true); } }, []);
  const persist = (next: Session) => { localStorage.setItem(KEY, JSON.stringify(next)); setSession(next); return next; };
  const value = useMemo<AuthValue>(() => ({ session, ready, signIn: async (data) => persist(await api.login(data)), register: async (data) => persist(await api.register(data)), startDemo: (role) => persist(api.demoSession(role)), signOut: () => { localStorage.removeItem(KEY); setSession(null); } }), [session, ready]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error("useAuth must be used inside AuthProvider"); return value; }
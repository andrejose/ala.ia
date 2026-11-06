import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, hasStoredSession, onSessionChange, refreshSession, setSession } from "../../lib/api";
import type { AuthResponse, User } from "../../lib/types";

type Status = "loading" | "authenticated" | "anonymous";

interface AuthContextValue {
  status: Status;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>(() => (hasStoredSession() ? "loading" : "anonymous"));
  const [user, setUser] = useState<User | null>(null);

  // Mantém o estado em dia com o cliente da API (ex.: renovação recusada -> anônimo)
  useEffect(
    () =>
      onSessionChange((auth) => {
        setUser(auth?.user ?? null);
        setStatus(auth ? "authenticated" : "anonymous");
        if (!auth) queryClient.clear();
      }),
    [queryClient]
  );

  // Ao abrir a página, tenta retomar a sessão salva
  useEffect(() => {
    if (!hasStoredSession()) return;
    refreshSession().catch(() => setStatus("anonymous"));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setSession(await api.post<AuthResponse>("/auth/login", { email, password }));
  }, []);

  const signup = useCallback(async (name: string, email: string, password: string) => {
    const auth = await api.post<AuthResponse>("/auth/signup", { name, email, password });
    if (auth.session) setSession(auth);
    return { needsConfirmation: !auth.session };
  }, []);

  const logout = useCallback(async () => {
    await api.post("/auth/logout").catch(() => undefined); // sai mesmo se a API falhar
    setSession(null);
  }, []);

  const value = useMemo(() => ({ status, user, login, signup, logout }), [status, user, login, signup, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth precisa estar dentro de <AuthProvider>");
  return context;
}

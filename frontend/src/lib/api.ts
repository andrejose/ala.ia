import type { ApiErrorBody, AuthResponse, Session } from "./types";

// =============================================================================
// Cliente da API
//
// - Todas as chamadas vão para /api (o Vite repassa para o backend).
// - O access_token fica só em memória; o refresh_token fica no localStorage,
//   para a sessão sobreviver a um recarregamento da página.
// - Se uma chamada voltar 401, renova a sessão uma vez e repete a chamada.
// =============================================================================

const BASE_URL = "/api";
const REFRESH_KEY = "ala.refresh_token";

// Na interface, "household" se chama "espaço". A API e o banco continuam usando
// "household"; as mensagens que chegam de lá são ajustadas aqui antes de
// aparecer na tela. As duas palavras são masculinas, então a frase continua certa.
function toUiTerms(message: string): string {
  return message
    .replace(/\bHouseholds\b/g, "Espaços")
    .replace(/\bhouseholds\b/g, "espaços")
    .replace(/\bHousehold\b/g, "Espaço")
    .replace(/\bhousehold\b/g, "espaço");
}

export class ApiError extends Error {
  status: number;
  code: string;
  fieldErrors: Record<string, string>;

  constructor(status: number, body: ApiErrorBody | null) {
    super(toUiTerms(body?.error.message ?? "Não foi possível falar com o servidor. Verifique se a API está rodando."));
    this.name = "ApiError";
    this.status = status;
    this.code = body?.error.code ?? "NETWORK_ERROR";

    // details de VALIDATION_ERROR -> { campo: mensagem }
    this.fieldErrors = {};
    const details = body?.error.details;
    if (Array.isArray(details)) {
      for (const d of details) {
        if (d.path && !this.fieldErrors[d.path]) this.fieldErrors[d.path] = toUiTerms(d.message);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Sessão
// ---------------------------------------------------------------------------
let accessToken: string | null = null;
let refreshInFlight: Promise<AuthResponse | null> | null = null;
const listeners = new Set<(session: AuthResponse | null) => void>();

function readRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

function writeRefreshToken(token: string | null) {
  try {
    if (token) localStorage.setItem(REFRESH_KEY, token);
    else localStorage.removeItem(REFRESH_KEY);
  } catch {
    // sem localStorage: a sessão dura só enquanto a página estiver aberta
  }
}

// Guarda a sessão recebida em login/cadastro/renovação e avisa quem estiver ouvindo
export function setSession(auth: AuthResponse | null) {
  const session: Session | null = auth?.session ?? null;
  accessToken = session?.access_token ?? null;
  writeRefreshToken(session?.refresh_token ?? null);
  for (const listener of listeners) listener(session ? auth : null);
}

export function onSessionChange(listener: (session: AuthResponse | null) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function hasStoredSession() {
  return readRefreshToken() !== null;
}

// Renova a sessão com o refresh_token salvo. Chamadas simultâneas
// compartilham a mesma renovação (o refresh_token só pode ser usado uma vez).
export function refreshSession(): Promise<AuthResponse | null> {
  if (refreshInFlight) return refreshInFlight;

  const refreshToken = readRefreshToken();
  if (!refreshToken) return Promise.resolve(null);

  refreshInFlight = request<AuthResponse>("/auth/refresh", {
    method: "POST",
    body: { refresh_token: refreshToken },
    auth: false,
  })
    .then((auth) => {
      setSession(auth);
      return auth;
    })
    .catch((error) => {
      // Só descarta a sessão se o servidor recusou o token (não em queda de rede)
      if (error instanceof ApiError && error.status === 401) setSession(null);
      throw error;
    })
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

// ---------------------------------------------------------------------------
// Requisições
// ---------------------------------------------------------------------------
interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  auth?: boolean;
}

export async function request<T>(path: string, options: RequestOptions = {}, retried = false): Promise<T> {
  const { method = "GET", body, query, auth = true } = options;

  const url = new URL(BASE_URL + path, window.location.origin);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }

  // Arquivo (ex.: extrato na importação) vai cru; o resto vai como JSON
  const isFile = body instanceof Blob;
  const headers: Record<string, string> = {};
  if (isFile) headers["Content-Type"] = body.type || "text/csv";
  else if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let response: Response;
  try {
    response = await fetch(url, { method, headers, body: isFile ? body : body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, null);
  }

  // Token expirado: renova uma vez e tenta de novo
  if (response.status === 401 && auth && !retried && hasStoredSession()) {
    const renewed = await refreshSession().catch(() => null);
    if (renewed) return request<T>(path, options, true);
  }

  if (response.status === 204) return undefined as T;

  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, data);
  return data as T;
}

export const api = {
  get: <T>(path: string, query?: RequestOptions["query"]) => request<T>(path, { query }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
  upload: <T>(path: string, file: Blob, query?: RequestOptions["query"]) => request<T>(path, { method: "POST", body: file, query }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body }),
  delete: (path: string) => request<void>(path, { method: "DELETE" }),
};

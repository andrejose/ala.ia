import { isAuthError } from "@supabase/supabase-js";
import { HttpError } from "./HttpError.js";

// -----------------------------------------------------------------------------
// Erros do PostgREST / Postgres (supabase.from(...), supabase.rpc(...))
// Códigos: https://www.postgresql.org/docs/current/errcodes-appendix.html
// -----------------------------------------------------------------------------
export function fromPostgrestError(error) {
  switch (error.code) {
    case "PGRST116": // .single() sem linha (inclusive quando o RLS esconde a linha)
      return new HttpError(404, "NOT_FOUND", "Recurso não encontrado.");

    case "23503":
      // Delete de algo referenciado (ex.: conta com lançamentos) x
      // insert/update apontando para algo inválido (ex.: conta de outro household)
      if (error.message?.startsWith("update or delete")) {
        return new HttpError(
          409,
          "RESOURCE_IN_USE",
          "O registro está em uso por lançamentos e não pode ser excluído nem ter esse campo alterado."
        );
      }
      return new HttpError(
        400,
        "INVALID_REFERENCE",
        "Referência inválida: verifique se os ids informados existem, pertencem ao mesmo household e são do tipo correto."
      );

    case "23514":
    case "23502":
      return new HttpError(400, "CONSTRAINT_VIOLATION", "Os dados violam uma regra do banco.", {
        constraint: error.message,
      });

    case "22P02":
      return new HttpError(400, "INVALID_INPUT", "Valor em formato inválido.");

    case "42501":
      return new HttpError(403, "FORBIDDEN", "Você não tem permissão para esta operação.");

    case "23505":
      // Mensagem em português vinda das nossas funções (ex.: invite_member)
      return new HttpError(409, "CONFLICT", error.message?.startsWith("duplicate key")
        ? "Já existe um registro com esses dados."
        : error.message);

    case "P0001": // raise exception sem errcode nas funções RPC
      return new HttpError(400, "BUSINESS_RULE", error.message);

    case "P0002": // no_data_found, ex.: invite_member com e-mail não cadastrado
      return new HttpError(404, "NOT_FOUND", error.message);

    case "AL001": // trigger ensure_household_has_owner
      return new HttpError(409, "LAST_OWNER", error.message);

    case "AL002": // convite expirado ou já respondido
      return new HttpError(410, "INVITATION_UNAVAILABLE", error.message);

    case "22023": // invalid_parameter_value, ex.: convidar o próprio e-mail
      return new HttpError(400, "BUSINESS_RULE", error.message);

    case "PGRST301":
    case "PGRST303":
      return new HttpError(401, "INVALID_TOKEN", "Token inválido ou expirado.");

    default:
      return null;
  }
}

// -----------------------------------------------------------------------------
// Erros do Supabase Auth (supabase.auth.*)
// Códigos: https://supabase.com/docs/guides/auth/debugging/error-codes
// -----------------------------------------------------------------------------
const authErrorMap = {
  invalid_credentials: [401, "INVALID_CREDENTIALS", "E-mail ou senha incorretos."],
  user_already_exists: [409, "EMAIL_ALREADY_REGISTERED", "Este e-mail já está cadastrado."],
  email_exists: [409, "EMAIL_ALREADY_REGISTERED", "Este e-mail já está cadastrado."],
  weak_password: [400, "WEAK_PASSWORD", "A senha não atende aos requisitos mínimos."],
  email_not_confirmed: [403, "EMAIL_NOT_CONFIRMED", "Confirme o seu e-mail antes de entrar."],
  signup_disabled: [403, "SIGNUP_DISABLED", "Novos cadastros estão desativados."],
  validation_failed: [400, "VALIDATION_ERROR", "Dados inválidos."],
  over_request_rate_limit: [429, "RATE_LIMITED", "Muitas tentativas. Aguarde e tente novamente."],
  over_email_send_rate_limit: [429, "RATE_LIMITED", "Muitas tentativas. Aguarde e tente novamente."],
  refresh_token_not_found: [401, "INVALID_REFRESH_TOKEN", "Sessão inválida ou encerrada. Faça login novamente."],
  refresh_token_already_used: [401, "INVALID_REFRESH_TOKEN", "Sessão inválida ou encerrada. Faça login novamente."],
  session_not_found: [401, "INVALID_TOKEN", "Sessão inválida ou encerrada. Faça login novamente."],
  session_expired: [401, "INVALID_TOKEN", "Sessão expirada. Faça login novamente."],
  bad_jwt: [401, "INVALID_TOKEN", "Token inválido ou expirado."],
};

export function fromAuthError(error) {
  const mapped = authErrorMap[error.code];
  if (mapped) return new HttpError(...mapped);

  if (error.status >= 400 && error.status < 500) {
    return new HttpError(error.status, "AUTH_ERROR", error.message);
  }
  return null;
}

// -----------------------------------------------------------------------------
// Supabase fora do alcance ou mal configurado: endereço errado, rede da VPS
// sem saída, Supabase fora do ar ou chave recusada. Para quem usa o app é a
// mesma coisa (503: tente de novo), mas o motivo vai para o log.
// Formatos que o supabase-js devolve:
//   Auth:  AuthRetryableFetchError, status 0, "fetch failed"
//   Dados: { code: "", message: "TypeError: fetch failed", details: "... getaddrinfo ENOTFOUND ..." }
//   Chave recusada (produção): "Invalid API key"
// -----------------------------------------------------------------------------
export function unavailableError(error) {
  const message = String(error?.message ?? "");
  const unreachable =
    error?.name === "AuthRetryableFetchError" ||
    (error?.name === "TypeError" && /fetch failed/i.test(message)) ||
    (error?.code === "" && /fetch failed/i.test(message));
  const badKey = /invalid api key/i.test(message);
  if (!unreachable && !badKey) return null;

  // Causa da falha de rede, quando vem: "getaddrinfo ENOTFOUND", "ECONNREFUSED"...
  const cause = /Caused by: [^\n]*?(getaddrinfo \w+|E[A-Z_]{3,})/.exec(String(error?.details ?? ""))?.[1];
  const reason = badKey
    ? "O Supabase recusou a chave (confira SUPABASE_PUBLISHABLE_KEY)"
    : `Não foi possível conectar ao Supabase (confira SUPABASE_URL e a rede): ${cause ?? message}`;
  const httpError = new HttpError(
    503,
    "SERVICE_UNAVAILABLE",
    "Não foi possível falar com o banco de dados agora. Tente de novo em instantes."
  );
  httpError.reason = reason; // só para o log; não vai na resposta
  return httpError;
}

// Converte qualquer erro vindo do supabase-js em HttpError (ou null se desconhecido)
export function fromSupabaseError(error) {
  const unavailable = unavailableError(error);
  if (unavailable) return unavailable;
  if (isAuthError(error)) return fromAuthError(error);
  if (error && typeof error.code === "string") return fromPostgrestError(error);
  return null;
}

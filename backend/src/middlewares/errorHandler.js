import { HttpError } from "../errors/HttpError.js";
import { fromSupabaseError } from "../errors/supabaseErrors.js";

// Rota inexistente
export function notFound(req, res, next) {
  next(new HttpError(404, "ROUTE_NOT_FOUND", `Rota ${req.method} ${req.path} não encontrada.`));
}

// Middleware de erro central: todo erro vira { error: { code, message, details? } }
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  let httpError = err instanceof HttpError ? err : fromSupabaseError(err);

  // JSON malformado no body (express.json)
  if (!httpError && err.type === "entity.parse.failed") {
    httpError = new HttpError(400, "INVALID_JSON", "O corpo da requisição não é um JSON válido.");
  }

  // Corpo maior que o limite (ex.: extrato grande demais na importação)
  if (!httpError && err.type === "entity.too.large") {
    httpError = new HttpError(413, "PAYLOAD_TOO_LARGE", "O arquivo ou os dados enviados são grandes demais.");
  }

  if (!httpError) {
    console.error(err);
    httpError = new HttpError(500, "INTERNAL_ERROR", "Erro interno do servidor.");
  }

  // Falha do lado do servidor que já tem motivo conhecido (ex.: Supabase fora do alcance)
  if (httpError.reason) {
    console.error(JSON.stringify({ time: new Date().toISOString(), level: "error", code: httpError.code, reason: httpError.reason }));
  }

  const body = { error: { code: httpError.code, message: httpError.message } };
  if (httpError.details !== undefined) body.error.details = httpError.details;

  res.status(httpError.status).json(body);
}

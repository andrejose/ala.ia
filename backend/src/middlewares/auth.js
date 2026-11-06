import { HttpError } from "../errors/HttpError.js";
import { createUserClient } from "../lib/supabase.js";

// Exige "Authorization: Bearer <access_token>".
// Valida o token no Supabase Auth e disponibiliza para os controllers:
//   req.user        -> usuário autenticado (auth.users)
//   req.accessToken -> o token recebido
//   req.supabase    -> cliente Supabase agindo como o usuário (RLS aplicado)
export async function requireAuth(req, res, next) {
  const [scheme, token] = (req.get("authorization") ?? "").split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw new HttpError(401, "UNAUTHORIZED", "Informe o token de acesso no header Authorization: Bearer <token>.");
  }

  const supabase = createUserClient(token);
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data?.user) {
    throw new HttpError(401, "INVALID_TOKEN", "Token inválido ou expirado.");
  }

  req.user = data.user;
  req.accessToken = token;
  req.supabase = supabase;
  next();
}

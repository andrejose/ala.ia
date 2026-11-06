import { HttpError } from "../errors/HttpError.js";
import { createAnonClient } from "../lib/supabase.js";

// Dados públicos do usuário devolvidos pela API
export function toUserDto(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.user_metadata?.name ?? null,
    created_at: user.created_at,
  };
}

function toSessionDto(session) {
  if (!session) return null;
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    token_type: session.token_type,
    expires_in: session.expires_in,
    expires_at: session.expires_at,
  };
}

// POST /auth/signup
// O trigger handle_new_user cria o perfil e o household pessoal.
export async function signup(req, res) {
  const { name, email, password } = req.validated.body;

  const { data, error } = await createAnonClient().auth.signUp({
    email,
    password,
    options: { data: { name } },
  });
  if (error) throw error;

  // session = null quando o projeto exige confirmação de e-mail
  res.status(201).json({ user: toUserDto(data.user), session: toSessionDto(data.session) });
}

// POST /auth/login
export async function login(req, res) {
  const { email, password } = req.validated.body;

  const { data, error } = await createAnonClient().auth.signInWithPassword({ email, password });
  if (error) throw error;

  res.status(200).json({ user: toUserDto(data.user), session: toSessionDto(data.session) });
}

// POST /auth/refresh
export async function refresh(req, res) {
  const { refresh_token } = req.validated.body;

  const { data, error } = await createAnonClient().auth.refreshSession({ refresh_token });
  // Token em formato inválido chega como "validation_failed" (400); para o cliente
  // é o mesmo caso de um token expirado: precisa fazer login de novo.
  if (error?.code === "validation_failed") {
    throw new HttpError(401, "INVALID_REFRESH_TOKEN", "Sessão inválida ou encerrada. Faça login novamente.");
  }
  if (error) throw error;

  res.status(200).json({ user: toUserDto(data.user), session: toSessionDto(data.session) });
}

// POST /auth/logout — revoga apenas a sessão do token enviado
export async function logout(req, res) {
  const { error } = await createAnonClient().auth.admin.signOut(req.accessToken, "local");
  if (error) throw error;

  res.status(204).end();
}

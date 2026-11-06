import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

// Em um servidor, o cliente não pode guardar sessão entre requisições:
// cada requisição cria o seu, para que um usuário nunca use a sessão de outro.
const serverAuthOptions = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
};

// Cliente sem usuário: usado pelas rotas públicas de autenticação (signup, login...)
export function createAnonClient() {
  return createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: serverAuthOptions,
  });
}

// Cliente que age como o usuário logado: o RLS do banco usa o token dele.
export function createUserClient(accessToken) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: serverAuthOptions,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

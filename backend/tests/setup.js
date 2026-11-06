// Trava de segurança: os testes criam usuários de verdade, então só rodam
// contra o Supabase local (npx supabase start).
const url = process.env.SUPABASE_URL ?? "";
const { hostname } = URL.canParse(url) ? new URL(url) : {};

if (!["127.0.0.1", "localhost", "::1"].includes(hostname)) {
  throw new Error(
    `Os testes só rodam contra o Supabase local. SUPABASE_URL atual: "${url || "(vazio)"}". ` +
      "Crie o backend/.env.test a partir do .env.test.example."
  );
}

import dotenv from "dotenv";
import { z } from "zod";

// Carrega o .env (não sobrescreve variáveis já definidas, ex.: as do .env.test nos testes)
dotenv.config({ quiet: true });

const envSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3001),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // Pasta com o frontend já compilado (frontend/dist). Definida, o backend
  // também entrega as telas, no mesmo endereço da API (ver o Dockerfile).
  STATIC_DIR: z.string().min(1).optional(),
  // Tentativas de login, cadastro e renovação de sessão por IP a cada 15 minutos
  AUTH_RATE_LIMIT: z.coerce.number().int().positive().default(20),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const vars = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
  throw new Error(`Variáveis de ambiente inválidas ou ausentes: ${vars}. Veja o .env.example.`);
}

export const env = parsed.data;

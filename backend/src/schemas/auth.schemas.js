import { z } from "../lib/zod.js";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email())
  .meta({ format: "email", example: "maria@example.com" });

export const signupSchema = z.object({
  name: z.string().trim().min(1).max(100).meta({ example: "Maria Silva" }),
  email,
  // Mínimo igual ao minimum_password_length do Supabase Auth; 72 é o limite do bcrypt
  password: z.string().min(6).max(72).meta({ example: "senhaForte123" }),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1).meta({ example: "senhaForte123" }),
});

export const refreshSchema = z.object({
  refresh_token: z.string().min(1),
});

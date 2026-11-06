import { randomUUID } from "node:crypto";
import request from "supertest";
import { app } from "../../src/app.js";

export const TEST_PASSWORD = "senha-de-teste-123";

// E-mail único por chamada, para os testes não colidirem entre si
export function uniqueEmail(prefix = "user") {
  return `${prefix}-${randomUUID()}@example.com`;
}

// Cadastra um usuário pela API e devolve dados e tokens para usar nos testes:
//   const maria = await createTestUser({ name: "Maria" });
//   request(app).get("/me").set(maria.authHeader)
export async function createTestUser({ name = "Usuário de Teste", email = uniqueEmail() } = {}) {
  const res = await request(app)
    .post("/auth/signup")
    .send({ name, email, password: TEST_PASSWORD });

  if (res.status !== 201 || !res.body.session) {
    throw new Error(`Falha ao criar usuário de teste: ${res.status} ${JSON.stringify(res.body)}`);
  }

  const { user, session } = res.body;
  return {
    ...user,
    password: TEST_PASSWORD,
    session,
    accessToken: session.access_token,
    authHeader: { Authorization: `Bearer ${session.access_token}` },
  };
}

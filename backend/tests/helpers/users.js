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
  const authHeader = { Authorization: `Bearer ${session.access_token}` };

  // Household pessoal criado pelo trigger de cadastro
  const me = await request(app).get("/me").set(authHeader);
  const householdId = me.body.households?.[0]?.id;

  return {
    ...user,
    password: TEST_PASSWORD,
    session,
    accessToken: session.access_token,
    authHeader,
    householdId,
    // Prefixo das rotas do household pessoal: `${maria.base}/accounts`
    base: `/households/${householdId}`,
  };
}

// Atalhos para os testes criarem dados pela própria API
export async function createAccount(user, body = {}, householdBase = user.base) {
  const res = await request(app)
    .post(`${householdBase}/accounts`)
    .set(user.authHeader)
    .send({ name: "Conta Teste", type: "checking", initial_balance: 0, ...body });
  if (res.status !== 201) throw new Error(`createAccount: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

export async function createCategory(user, body = {}, householdBase = user.base) {
  const res = await request(app)
    .post(`${householdBase}/categories`)
    .set(user.authHeader)
    .send({ name: `Categoria ${randomUUID().slice(0, 8)}`, type: "expense", ...body });
  if (res.status !== 201) throw new Error(`createCategory: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

export async function createTransaction(user, body, householdBase = user.base) {
  const res = await request(app).post(`${householdBase}/transactions`).set(user.authHeader).send(body);
  if (res.status !== 201) throw new Error(`createTransaction: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

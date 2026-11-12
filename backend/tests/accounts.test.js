import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { createAccount, createCategory, createTestUser, createTransaction } from "./helpers/users.js";

let maria;
let joao;

beforeAll(async () => {
  maria = await createTestUser({ name: "Maria Contas" });
  joao = await createTestUser({ name: "João Contas" });
});

describe("Contas — CRUD", () => {
  it("cria uma conta com saldo atual igual ao inicial", async () => {
    const res = await request(app)
      .post(`${maria.base}/accounts`)
      .set(maria.authHeader)
      .send({ name: "Nubank", type: "checking", initial_balance: 1500.75 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: expect.any(String),
      household_id: maria.householdId,
      name: "Nubank",
      type: "checking",
      is_active: true,
      initial_balance: 1500.75,
      current_balance: 1500.75,
    });
  });

  it("usa os valores padrão (checking, saldo 0)", async () => {
    const res = await request(app).post(`${maria.base}/accounts`).set(maria.authHeader).send({ name: "Carteira" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ type: "checking", initial_balance: 0, current_balance: 0 });
  });

  it("lista, busca, edita e arquiva", async () => {
    const account = await createAccount(maria, { name: "Poupança", type: "savings" });

    const list = await request(app).get(`${maria.base}/accounts`).set(maria.authHeader);
    expect(list.status).toBe(200);
    expect(list.body.map((a) => a.id)).toContain(account.id);

    const get = await request(app).get(`${maria.base}/accounts/${account.id}`).set(maria.authHeader);
    expect(get.status).toBe(200);
    expect(get.body.name).toBe("Poupança");

    const patch = await request(app)
      .patch(`${maria.base}/accounts/${account.id}`)
      .set(maria.authHeader)
      .send({ name: "Poupança Caixa", is_active: false });
    expect(patch.status).toBe(200);
    expect(patch.body).toMatchObject({ name: "Poupança Caixa", is_active: false });

    const active = await request(app).get(`${maria.base}/accounts?is_active=true`).set(maria.authHeader);
    expect(active.body.map((a) => a.id)).not.toContain(account.id);

    const archived = await request(app).get(`${maria.base}/accounts?is_active=false`).set(maria.authHeader);
    expect(archived.body.map((a) => a.id)).toContain(account.id);
  });

  it("exclui uma conta sem lançamentos", async () => {
    const account = await createAccount(maria);

    const del = await request(app).delete(`${maria.base}/accounts/${account.id}`).set(maria.authHeader);
    expect(del.status).toBe(204);

    const get = await request(app).get(`${maria.base}/accounts/${account.id}`).set(maria.authHeader);
    expect(get.status).toBe(404);
  });

  it("não exclui conta com lançamentos (409) e sugere arquivar", async () => {
    const account = await createAccount(maria);
    const category = await createCategory(maria);
    await createTransaction(maria, {
      type: "expense",
      description: "Padaria",
      amount: 10,
      account_id: account.id,
      category_id: category.id,
    });

    const res = await request(app).delete(`${maria.base}/accounts/${account.id}`).set(maria.authHeader);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("RESOURCE_IN_USE");
    expect(res.body.error.message).toContain("is_active");
  });

  it("cartão de crédito: compras deixam o saldo negativo e o pagamento da fatura zera", async () => {
    const corrente = await createAccount(maria, { name: "Corrente", initial_balance: 2000 });
    const card = await request(app)
      .post(`${maria.base}/accounts`)
      .set(maria.authHeader)
      .send({ name: "Cartão Nubank", type: "credit_card", initial_balance: -100 });
    expect(card.status).toBe(201);
    expect(card.body).toMatchObject({ type: "credit_card", current_balance: -100 });

    const category = await createCategory(maria);
    await createTransaction(maria, {
      type: "expense",
      description: "Mercado no cartão",
      payment_date: "2026-11-06",
      amount: 300,
      account_id: card.body.id,
      category_id: category.id,
    });

    let get = await request(app).get(`${maria.base}/accounts/${card.body.id}`).set(maria.authHeader);
    expect(get.body.current_balance).toBe(-400);

    await createTransaction(maria, {
      type: "transfer",
      description: "Pagamento da fatura",
      payment_date: "2026-11-10",
      amount: 400,
      account_id: corrente.id,
      destination_account_id: card.body.id,
    });

    get = await request(app).get(`${maria.base}/accounts/${card.body.id}`).set(maria.authHeader);
    expect(get.body.current_balance).toBe(0);
    const source = await request(app).get(`${maria.base}/accounts/${corrente.id}`).set(maria.authHeader);
    expect(source.body.current_balance).toBe(1600);
  });
});

describe("Contas — validação", () => {
  it("recusa tipo inválido e mais de 2 casas decimais (400)", async () => {
    const res = await request(app)
      .post(`${maria.base}/accounts`)
      .set(maria.authHeader)
      .send({ name: "X", type: "cartao", initial_balance: 10.123 });

    expect(res.status).toBe(400);
    const fields = res.body.error.details.map((d) => d.path);
    expect(fields).toEqual(expect.arrayContaining(["type", "initial_balance"]));
  });

  it("recusa PATCH vazio (400)", async () => {
    const account = await createAccount(maria);
    const res = await request(app).patch(`${maria.base}/accounts/${account.id}`).set(maria.authHeader).send({});

    expect(res.status).toBe(400);
  });

  it("recusa id que não é UUID (400)", async () => {
    const res = await request(app).get(`${maria.base}/accounts/123`).set(maria.authHeader);

    expect(res.status).toBe(400);
    expect(res.body.error.details[0]).toMatchObject({ in: "params", path: "id" });
  });

  it("exige token (401)", async () => {
    const res = await request(app).get(`${maria.base}/accounts`);

    expect(res.status).toBe(401);
  });
});

describe("Contas — isolamento entre households (RLS)", () => {
  it("outro usuário não lista, não lê, não edita e não cria contas no household alheio (404)", async () => {
    const account = await createAccount(maria, { name: "Secreta" });

    const list = await request(app).get(`${maria.base}/accounts`).set(joao.authHeader);
    const get = await request(app).get(`${maria.base}/accounts/${account.id}`).set(joao.authHeader);
    const patch = await request(app)
      .patch(`${maria.base}/accounts/${account.id}`)
      .set(joao.authHeader)
      .send({ name: "Hackeada" });
    const create = await request(app).post(`${maria.base}/accounts`).set(joao.authHeader).send({ name: "Intrusa" });

    for (const res of [list, get, patch, create]) {
      expect(res.status).toBe(404);
    }
  });

  it("a conta de outro household não aparece pelo household do próprio usuário (404)", async () => {
    const account = await createAccount(maria);
    const res = await request(app).get(`${joao.base}/accounts/${account.id}`).set(joao.authHeader);

    expect(res.status).toBe(404);
  });
});

import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { createAccount, createCategory, createTestUser, createTransaction } from "./helpers/users.js";

let carla;
let bruno;
let checking;
let savings;
let salary;
let groceries;

beforeAll(async () => {
  carla = await createTestUser({ name: "Carla Lançamentos" });
  bruno = await createTestUser({ name: "Bruno Lançamentos" });
  checking = await createAccount(carla, { name: "Corrente", initial_balance: 1000 });
  savings = await createAccount(carla, { name: "Poupança", type: "savings", initial_balance: 0 });
  salary = await createCategory(carla, { name: "Renda", type: "income" });
  groceries = await createCategory(carla, { name: "Feira", type: "expense" });
});

describe("Lançamentos — criação e regras", () => {
  it("cria receita, despesa e transferência", async () => {
    const income = await request(app).post(`${carla.base}/transactions`).set(carla.authHeader).send({
      type: "income",
      description: "Salário",
      amount: 5000,
      account_id: checking.id,
      category_id: salary.id,
      due_date: "2026-10-05",
      payment_date: "2026-10-05",
    });
    expect(income.status).toBe(201);
    expect(income.body).toMatchObject({ type: "income", amount: 5000, user_id: carla.id, destination_account_id: null });

    const expense = await request(app).post(`${carla.base}/transactions`).set(carla.authHeader).send({
      type: "expense",
      description: "Feira",
      amount: 85.9,
      account_id: checking.id,
      category_id: groceries.id,
    });
    expect(expense.status).toBe(201);
    expect(expense.body.payment_date).toBeNull();
    expect(expense.body.due_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const transfer = await request(app).post(`${carla.base}/transactions`).set(carla.authHeader).send({
      type: "transfer",
      description: "Guardar",
      amount: 300,
      account_id: checking.id,
      destination_account_id: savings.id,
    });
    expect(transfer.status).toBe(201);
    expect(transfer.body.category_id).toBeNull();
  });

  it("ignora user_id e household_id enviados no body", async () => {
    const res = await request(app).post(`${carla.base}/transactions`).set(carla.authHeader).send({
      type: "expense",
      description: "Tentativa",
      amount: 1,
      account_id: checking.id,
      category_id: groceries.id,
      user_id: bruno.id,
      household_id: bruno.householdId,
    });

    expect(res.status).toBe(201);
    expect(res.body.user_id).toBe(carla.id);
    expect(res.body.household_id).toBe(carla.householdId);
  });

  // Cada caso monta o body a partir das contas/categorias criadas no beforeAll
  it.each([
    ["transferência sem destino", () => ({ type: "transfer" }), "destination_account_id"],
    [
      "transferência com categoria",
      () => ({ type: "transfer", destination_account_id: savings.id, category_id: groceries.id }),
      "category_id",
    ],
    ["receita sem categoria", () => ({ type: "income" }), "category_id"],
    ["despesa com conta de destino", () => ({ type: "expense", category_id: groceries.id, destination_account_id: savings.id }), "destination_account_id"],
    ["valor zero", () => ({ type: "expense", category_id: groceries.id, amount: 0 }), "amount"],
    ["valor negativo", () => ({ type: "expense", category_id: groceries.id, amount: -5 }), "amount"],
    ["data inválida", () => ({ type: "expense", category_id: groceries.id, due_date: "05/10/2026" }), "due_date"],
  ])("recusa %s (400)", async (_, buildBody, field) => {
    const res = await request(app)
      .post(`${carla.base}/transactions`)
      .set(carla.authHeader)
      .send({ description: "x", amount: 1, account_id: checking.id, ...buildBody() });

    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.path)).toContain(field);
  });

  it("transferência para a própria conta é recusada (400)", async () => {
    const res = await request(app).post(`${carla.base}/transactions`).set(carla.authHeader).send({
      type: "transfer",
      description: "x",
      amount: 1,
      account_id: checking.id,
      destination_account_id: checking.id,
    });

    expect(res.status).toBe(400);
  });

  it("despesa com categoria de receita é recusada pelo banco (400 INVALID_REFERENCE)", async () => {
    const res = await request(app).post(`${carla.base}/transactions`).set(carla.authHeader).send({
      type: "expense",
      description: "Errada",
      amount: 10,
      account_id: checking.id,
      category_id: salary.id,
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_REFERENCE");
  });

  it("não aceita conta de outro household (400 INVALID_REFERENCE)", async () => {
    const brunoAccount = await createAccount(bruno);
    const res = await request(app).post(`${carla.base}/transactions`).set(carla.authHeader).send({
      type: "expense",
      description: "Conta alheia",
      amount: 10,
      account_id: brunoAccount.id,
      category_id: groceries.id,
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_REFERENCE");
  });
});

describe("Lançamentos — listagem", () => {
  let base;
  let account;

  beforeAll(async () => {
    // Conta própria deste bloco, para os filtros não dependerem dos outros testes
    account = await createAccount(carla, { name: "Filtros" });
    base = { account_id: account.id, category_id: groceries.id, type: "expense", amount: 10 };
    await createTransaction(carla, { ...base, description: "Pago setembro", due_date: "2026-09-10", payment_date: "2026-09-10" });
    await createTransaction(carla, { ...base, description: "Pendente outubro", due_date: "2026-10-10" });
    await createTransaction(carla, { ...base, description: "Pago outubro", due_date: "2026-10-20", payment_date: "2026-10-21" });
    await createTransaction(carla, {
      type: "transfer",
      description: "Entrada por transferência",
      amount: 50,
      account_id: checking.id,
      destination_account_id: account.id,
      due_date: "2026-10-15",
      payment_date: "2026-10-15",
    });
  });

  const list = (query) =>
    request(app).get(`${carla.base}/transactions`).query({ account_id: account.id, ...query }).set(carla.authHeader);

  it("filtra por conta (origem ou destino), ordena por vencimento e pagina", async () => {
    const res = await list({});

    expect(res.status).toBe(200);
    expect(res.body.pagination).toEqual({ total: 4, limit: 50, offset: 0 });
    expect(res.body.data.map((t) => t.due_date)).toEqual(["2026-10-20", "2026-10-15", "2026-10-10", "2026-09-10"]);

    const page = await list({ limit: 2, offset: 2 });
    expect(page.body.data.map((t) => t.description)).toEqual(["Pendente outubro", "Pago setembro"]);
    expect(page.body.pagination.total).toBe(4);
  });

  it("filtra por período, tipo e status", async () => {
    const october = await list({ from: "2026-10-01", to: "2026-10-31" });
    expect(october.body.pagination.total).toBe(3);

    const transfers = await list({ type: "transfer" });
    expect(transfers.body.data.map((t) => t.description)).toEqual(["Entrada por transferência"]);

    const pending = await list({ status: "pending" });
    expect(pending.body.data.map((t) => t.description)).toEqual(["Pendente outubro"]);

    const paid = await list({ status: "paid", type: "expense" });
    expect(paid.body.pagination.total).toBe(2);
  });

  it("valida a query (400)", async () => {
    const res = await list({ from: "2026-10-31", to: "2026-10-01", limit: 500 });

    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.path)).toEqual(expect.arrayContaining(["limit"]));
  });
});

describe("Lançamentos — edição e exclusão", () => {
  it("marca como pago e edita valores", async () => {
    const tx = await createTransaction(carla, {
      type: "expense",
      description: "Luz",
      amount: 120,
      account_id: checking.id,
      category_id: groceries.id,
    });

    const res = await request(app)
      .patch(`${carla.base}/transactions/${tx.id}`)
      .set(carla.authHeader)
      .send({ payment_date: "2026-11-06", amount: 118.4 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ payment_date: "2026-11-06", amount: 118.4 });
  });

  it("valida as regras sobre o lançamento mesclado (virar transfer exige destino e sem categoria)", async () => {
    const tx = await createTransaction(carla, {
      type: "expense",
      description: "Vai virar transferência",
      amount: 10,
      account_id: checking.id,
      category_id: groceries.id,
    });

    const invalid = await request(app)
      .patch(`${carla.base}/transactions/${tx.id}`)
      .set(carla.authHeader)
      .send({ type: "transfer" });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.details.map((d) => d.path)).toEqual(
      expect.arrayContaining(["destination_account_id", "category_id"])
    );

    const valid = await request(app)
      .patch(`${carla.base}/transactions/${tx.id}`)
      .set(carla.authHeader)
      .send({ type: "transfer", destination_account_id: savings.id, category_id: null });
    expect(valid.status).toBe(200);
    expect(valid.body).toMatchObject({ type: "transfer", destination_account_id: savings.id, category_id: null });
  });

  it("exclui (204) e depois não encontra (404)", async () => {
    const tx = await createTransaction(carla, {
      type: "income",
      description: "Pix",
      amount: 20,
      account_id: checking.id,
      category_id: salary.id,
    });

    const del = await request(app).delete(`${carla.base}/transactions/${tx.id}`).set(carla.authHeader);
    expect(del.status).toBe(204);

    const get = await request(app).get(`${carla.base}/transactions/${tx.id}`).set(carla.authHeader);
    expect(get.status).toBe(404);
  });

  it("outro usuário não lê nem edita lançamentos alheios (404)", async () => {
    const tx = await createTransaction(carla, {
      type: "expense",
      description: "Privado",
      amount: 5,
      account_id: checking.id,
      category_id: groceries.id,
    });

    const viaCarla = await request(app).get(`${carla.base}/transactions/${tx.id}`).set(bruno.authHeader);
    const viaBruno = await request(app)
      .patch(`${bruno.base}/transactions/${tx.id}`)
      .set(bruno.authHeader)
      .send({ amount: 1 });

    expect(viaCarla.status).toBe(404);
    expect(viaBruno.status).toBe(404);
  });
});

describe("Saldo das contas", () => {
  it("considera receitas, despesas e transferências pagas; pendentes não contam", async () => {
    const user = await createTestUser({ name: "Saldo" });
    const origin = await createAccount(user, { name: "Origem", initial_balance: 1000 });
    const destination = await createAccount(user, { name: "Destino", initial_balance: 50 });
    const income = await createCategory(user, { name: "Renda", type: "income" });
    const expense = await createCategory(user, { name: "Gasto", type: "expense" });
    const paid = { payment_date: "2026-11-01" };

    await createTransaction(user, { type: "income", description: "Renda", amount: 500, account_id: origin.id, category_id: income.id, ...paid });
    await createTransaction(user, { type: "expense", description: "Gasto", amount: 200.25, account_id: origin.id, category_id: expense.id, ...paid });
    await createTransaction(user, { type: "transfer", description: "Transf.", amount: 100, account_id: origin.id, destination_account_id: destination.id, ...paid });
    await createTransaction(user, { type: "expense", description: "Pendente", amount: 999, account_id: origin.id, category_id: expense.id });

    const originRes = await request(app).get(`${user.base}/accounts/${origin.id}`).set(user.authHeader);
    const destinationRes = await request(app).get(`${user.base}/accounts/${destination.id}`).set(user.authHeader);

    // 1000 + 500 - 200,25 - 100 = 1199,75 (os 999 pendentes não entram)
    expect(originRes.body.current_balance).toBe(1199.75);
    // 50 + 100
    expect(destinationRes.body.current_balance).toBe(150);
  });
});

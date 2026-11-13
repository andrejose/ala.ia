import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { createAccount, createCategory, createTestUser, createTransaction } from "./helpers/users.js";

let ana;
let joao;
let market;
let transport;
let salary;

beforeAll(async () => {
  ana = await createTestUser({ name: "Ana Orçamento" });
  joao = await createTestUser({ name: "João Orçamento" });
  const account = await createAccount(ana, { name: "Corrente" });
  market = await createCategory(ana, { name: "Feira", type: "expense" });
  transport = await createCategory(ana, { name: "Ônibus", type: "expense" });
  salary = await createCategory(ana, { name: "Pagamento", type: "income" });

  const tx = (body) => createTransaction(ana, { type: "expense", account_id: account.id, description: "x", ...body });
  await tx({ category_id: market.id, amount: 400, due_date: "2026-11-05", payment_date: "2026-11-05" });
  await tx({ category_id: market.id, amount: 200, due_date: "2026-11-20" });
  await tx({ category_id: market.id, amount: 999, due_date: "2026-10-30", payment_date: "2026-10-30" });
  await tx({ category_id: transport.id, amount: 250, due_date: "2026-11-08", payment_date: "2026-11-08" });
});

const put = (user, categoryId, amount) =>
  request(app).put(`${user.base}/budgets/${categoryId}`).set(user.authHeader).send({ amount });

describe("Orçamento", () => {
  it("define limites e mostra o gasto do mês, do mais usado para o menos", async () => {
    const first = await put(ana, market.id, 800);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ category_id: market.id, amount: 800 });
    await put(ana, transport.id, 200);

    const res = await request(app).get(`${ana.base}/budgets?month=2026-11`).set(ana.authHeader);
    expect(res.status).toBe(200);
    expect(res.body.month).toBe("2026-11");
    expect(res.body.total).toEqual({ amount: 1000, spent: 850, remaining: 150 });
    expect(res.body.budgets.map(({ name, amount, spent, paid, pending, remaining, percent }) => ({ name, amount, spent, paid, pending, remaining, percent }))).toEqual([
      { name: "Ônibus", amount: 200, spent: 250, paid: 250, pending: 0, remaining: -50, percent: 125 },
      { name: "Feira", amount: 800, spent: 600, paid: 400, pending: 200, remaining: 200, percent: 75 },
    ]);
  });

  it("trocar o limite não duplica e cada mês conta só o seu gasto", async () => {
    await put(ana, market.id, 1000);

    const res = await request(app).get(`${ana.base}/budgets?month=2026-10`).set(ana.authHeader);
    const feira = res.body.budgets.find((b) => b.name === "Feira");
    expect(res.body.budgets.filter((b) => b.name === "Feira")).toHaveLength(1);
    expect(feira).toMatchObject({ amount: 1000, spent: 999, percent: 100 });
  });

  it("tira o limite (204) e devolve 404 se não havia", async () => {
    const del = await request(app).delete(`${ana.base}/budgets/${transport.id}`).set(ana.authHeader);
    expect(del.status).toBe(204);

    const again = await request(app).delete(`${ana.base}/budgets/${transport.id}`).set(ana.authHeader);
    expect(again.status).toBe(404);

    const res = await request(app).get(`${ana.base}/budgets?month=2026-11`).set(ana.authHeader);
    expect(res.body.budgets.map((b) => b.name)).toEqual(["Feira"]);
  });

  it("recusa categoria de receita, valor inválido e id que não é UUID (400)", async () => {
    const income = await put(ana, salary.id, 100);
    expect(income.status).toBe(400);
    expect(income.body.error.code).toBe("INVALID_REFERENCE");

    const zero = await put(ana, market.id, 0);
    expect(zero.status).toBe(400);
    expect(zero.body.error.details[0].path).toBe("amount");

    const badId = await put(ana, "123", 10);
    expect(badId.status).toBe(400);
  });

  it("outra pessoa não vê nem define orçamento no household alheio (404); exige token (401)", async () => {
    const list = await request(app).get(`${ana.base}/budgets`).set(joao.authHeader);
    const define = await put(joao, market.id, 1).set(joao.authHeader);
    const foreign = await request(app).put(`${ana.base}/budgets/${market.id}`).set(joao.authHeader).send({ amount: 1 });
    for (const res of [list, foreign]) expect(res.status).toBe(404);
    // Na casa do João, a categoria da Ana não existe
    expect(define.status).toBe(400);

    const anonymous = await request(app).get(`${ana.base}/budgets`);
    expect(anonymous.status).toBe(401);
  });
});

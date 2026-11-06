import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { createAccount, createCategory, createTestUser, createTransaction } from "./helpers/users.js";

let user;
let other;

beforeAll(async () => {
  user = await createTestUser({ name: "Relatórios" });
  other = await createTestUser({ name: "Outro Relatórios" });

  const checking = await createAccount(user, { name: "Corrente", initial_balance: 0 });
  const savings = await createAccount(user, { name: "Poupança" });
  const salary = await createCategory(user, { name: "Salário", type: "income", color: "#00AA55" });
  const rent = await createCategory(user, { name: "Aluguel", type: "expense" });
  const food = await createCategory(user, { name: "Alimentação", type: "expense" });

  const tx = (body) => createTransaction(user, { account_id: checking.id, description: body.type, ...body });

  // Outubro/2026
  await tx({ type: "income", amount: 5000, category_id: salary.id, due_date: "2026-10-05", payment_date: "2026-10-05" });
  await tx({ type: "income", amount: 300, category_id: salary.id, due_date: "2026-10-28" }); // pendente
  await tx({ type: "expense", amount: 1800, category_id: rent.id, due_date: "2026-10-10", payment_date: "2026-10-10" });
  await tx({ type: "expense", amount: 250.5, category_id: food.id, due_date: "2026-10-12", payment_date: "2026-10-12" });
  await tx({ type: "expense", amount: 100, category_id: food.id, due_date: "2026-10-31" }); // pendente
  // Transferência não entra nos relatórios
  await tx({ type: "transfer", amount: 1000, destination_account_id: savings.id, due_date: "2026-10-15", payment_date: "2026-10-15" });
  // Fora do mês
  await tx({ type: "expense", amount: 999, category_id: food.id, due_date: "2026-11-01", payment_date: "2026-11-01" });
  await tx({ type: "expense", amount: 999, category_id: rent.id, due_date: "2026-09-30", payment_date: "2026-09-30" });
});

describe("GET /reports/summary", () => {
  it("resume receitas e despesas do mês, separando pagas e pendentes", async () => {
    const res = await request(app).get(`${user.base}/reports/summary?month=2026-10`).set(user.authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      month: "2026-10",
      income: { paid: 5000, pending: 300, total: 5300 },
      expense: { paid: 2050.5, pending: 100, total: 2150.5 },
      balance: { paid: 2949.5, total: 3149.5 },
    });
  });

  it("mês sem lançamentos devolve zeros", async () => {
    const res = await request(app).get(`${user.base}/reports/summary?month=2020-01`).set(user.authHeader);

    expect(res.status).toBe(200);
    expect(res.body.income.total).toBe(0);
    expect(res.body.balance.total).toBe(0);
  });

  it("usa o mês atual quando não informado", async () => {
    const res = await request(app).get(`${user.base}/reports/summary`).set(user.authHeader);

    expect(res.status).toBe(200);
    expect(res.body.month).toBe(new Date().toISOString().slice(0, 7));
  });

  it("valida o mês (400)", async () => {
    const res = await request(app).get(`${user.base}/reports/summary?month=2026-13`).set(user.authHeader);

    expect(res.status).toBe(400);
  });
});

describe("GET /reports/by-category", () => {
  it("soma as despesas por categoria, da maior para a menor", async () => {
    const res = await request(app).get(`${user.base}/reports/by-category?month=2026-10`).set(user.authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ month: "2026-10", type: "expense", total: 2150.5 });
    expect(res.body.categories).toEqual([
      expect.objectContaining({ name: "Aluguel", total: 1800, paid: 1800, pending: 0, transaction_count: 1 }),
      expect.objectContaining({ name: "Alimentação", total: 350.5, paid: 250.5, pending: 100, transaction_count: 2 }),
    ]);
  });

  it("aceita type=income", async () => {
    const res = await request(app)
      .get(`${user.base}/reports/by-category?month=2026-10&type=income`)
      .set(user.authHeader);

    expect(res.body.categories).toEqual([
      expect.objectContaining({ name: "Salário", color: "#00AA55", total: 5300, transaction_count: 2 }),
    ]);
  });
});

describe("Relatórios — isolamento (RLS)", () => {
  it("outro usuário não vê os relatórios do household (404)", async () => {
    const res = await request(app).get(`${user.base}/reports/summary?month=2026-10`).set(other.authHeader);

    expect(res.status).toBe(404);
  });
});

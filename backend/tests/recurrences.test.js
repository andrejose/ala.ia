import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { createAccount, createCategory, createTestUser } from "./helpers/users.js";

// As datas são relativas a hoje, no mesmo relógio do banco (UTC)
const now = new Date();
const monthOffset = (delta) => {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + delta, 1));
  return d.toISOString().slice(0, 7);
};
const today = now.toISOString().slice(0, 10);

let ana;
let joao;
let account;
let savings;
let category;

beforeAll(async () => {
  ana = await createTestUser({ name: "Ana Recorrente" });
  joao = await createTestUser({ name: "João Recorrente" });
  account = await createAccount(ana, { name: "Corrente" });
  savings = await createAccount(ana, { name: "Poupança", type: "savings" });
  category = await createCategory(ana, { name: "Moradia", type: "expense" });
});

function createRecurrence(body) {
  return request(app)
    .post(`${ana.base}/recurrences`)
    .set(ana.authHeader)
    .send({ type: "expense", account_id: account.id, category_id: category.id, day_of_month: 10, start_month: monthOffset(-1), ...body });
}

async function generated(recurrenceId) {
  const res = await request(app).get(`${ana.base}/transactions?limit=100`).set(ana.authHeader);
  return res.body.data
    .filter((tx) => tx.recurrence_id === recurrenceId)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
}

describe("Recorrentes — criar e gerar", () => {
  it("cria a regra e já gera do primeiro mês até o mês seguinte, pendentes", async () => {
    const res = await createRecurrence({ description: "Aluguel", amount: 1800 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      description: "Aluguel",
      amount: 1800,
      day_of_month: 10,
      start_month: monthOffset(-1),
      occurrences: null,
      auto_paid: false,
      is_active: true,
      generated: 3,
      generated_until: monthOffset(1),
    });

    const txs = await generated(res.body.id);
    expect(txs.map((tx) => tx.due_date)).toEqual([`${monthOffset(-1)}-10`, `${monthOffset(0)}-10`, `${monthOffset(1)}-10`]);
    expect(txs.every((tx) => tx.payment_date === null && tx.amount === 1800 && tx.description === "Aluguel")).toBe(true);

    // De novo: nada a gerar
    const again = await request(app).post(`${ana.base}/recurrences/materialize`).set(ana.authHeader);
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ generated: 0 });
  });

  it("parcelas com débito automático: numeradas e pagas só quando o dia chega", async () => {
    const res = await createRecurrence({
      description: "Geladeira",
      amount: 300,
      day_of_month: 1,
      start_month: monthOffset(0),
      occurrences: 2,
      auto_paid: true,
    });

    expect(res.status).toBe(201);
    expect(res.body.generated).toBe(1);
    const [first] = await generated(res.body.id);
    expect(first).toMatchObject({ description: "Geladeira (1/2)", due_date: `${monthOffset(0)}-01`, payment_date: `${monthOffset(0)}-01` });
  });

  it("transferência recorrente (guardar todo mês na poupança)", async () => {
    const res = await createRecurrence({
      type: "transfer",
      category_id: null,
      destination_account_id: savings.id,
      description: "Guardar",
      amount: 200,
      start_month: monthOffset(0),
    });

    expect(res.status).toBe(201);
    expect(res.body.generated).toBe(2);
  });
});

describe("Recorrentes — editar, pausar e excluir", () => {
  it("mudar o valor refaz só os pendentes que ainda não venceram", async () => {
    const { body } = await createRecurrence({ description: "Internet", amount: 100, day_of_month: 28 });

    const res = await request(app).patch(`${ana.base}/recurrences/${body.id}`).set(ana.authHeader).send({ amount: 120 });
    expect(res.status).toBe(200);
    expect(res.body.amount).toBe(120);

    const txs = await generated(body.id);
    expect(txs).toHaveLength(3);
    for (const tx of txs) expect(tx.amount).toBe(tx.due_date >= today ? 120 : 100);
  });

  it("pausar tira os pendentes futuros; reativar volta a gerar sem preencher o passado", async () => {
    const { body } = await createRecurrence({ description: "Academia", amount: 90, day_of_month: 31 });
    const before = await generated(body.id);
    const past = before.filter((tx) => tx.due_date < today);

    const pause = await request(app).patch(`${ana.base}/recurrences/${body.id}`).set(ana.authHeader).send({ is_active: false });
    expect(pause.status).toBe(200);
    expect((await generated(body.id)).map((tx) => tx.id)).toEqual(past.map((tx) => tx.id));

    const back = await request(app).patch(`${ana.base}/recurrences/${body.id}`).set(ana.authHeader).send({ is_active: true });
    expect(back.status).toBe(200);
    const after = await generated(body.id);
    expect(after.filter((tx) => tx.due_date < today).map((tx) => tx.id)).toEqual(past.map((tx) => tx.id));
    expect(after.at(-1).due_date.slice(0, 7)).toBe(monthOffset(1));
  });

  it("excluir tira os pendentes futuros por padrão e mantém o resto sem o vínculo", async () => {
    const { body } = await createRecurrence({ description: "Streaming", amount: 40, day_of_month: 28 });
    const before = await generated(body.id);

    const del = await request(app).delete(`${ana.base}/recurrences/${body.id}`).set(ana.authHeader);
    expect(del.status).toBe(204);

    const res = await request(app).get(`${ana.base}/transactions?limit=100`).set(ana.authHeader);
    const left = res.body.data.filter((tx) => before.some((b) => b.id === tx.id));
    expect(left.map((tx) => tx.id).sort()).toEqual(before.filter((tx) => tx.due_date < today).map((tx) => tx.id).sort());
    expect(left.every((tx) => tx.recurrence_id === null)).toBe(true);

    const get = await request(app).get(`${ana.base}/recurrences/${body.id}`).set(ana.authHeader);
    expect(get.status).toBe(404);
  });

  it("excluir com remove_pending=false mantém todos os lançamentos", async () => {
    const { body } = await createRecurrence({ description: "Seguro", amount: 50 });

    const del = await request(app).delete(`${ana.base}/recurrences/${body.id}?remove_pending=false`).set(ana.authHeader);
    expect(del.status).toBe(204);

    const res = await request(app).get(`${ana.base}/transactions?limit=100`).set(ana.authHeader);
    expect(res.body.data.filter((tx) => tx.description === "Seguro")).toHaveLength(3);
  });
});

describe("Recorrentes — validação e acesso", () => {
  it("recusa dia inválido, mês inválido e transferência com categoria (400)", async () => {
    const res = await createRecurrence({
      type: "transfer",
      destination_account_id: savings.id,
      description: "X",
      amount: 10,
      day_of_month: 32,
      start_month: "2026-13",
    });

    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.path)).toEqual(
      expect.arrayContaining(["day_of_month", "start_month", "category_id"])
    );
  });

  it("valida a regra mesclada no PATCH (virar transferência sem destino)", async () => {
    const { body } = await createRecurrence({ description: "Luz", amount: 150 });
    const res = await request(app)
      .patch(`${ana.base}/recurrences/${body.id}`)
      .set(ana.authHeader)
      .send({ type: "transfer" });

    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.path)).toEqual(expect.arrayContaining(["destination_account_id"]));
  });

  it("outra pessoa não vê, não cria e não gera no household alheio (404); exige token (401)", async () => {
    const { body } = await createRecurrence({ description: "Secreta", amount: 10 });

    const list = await request(app).get(`${ana.base}/recurrences`).set(joao.authHeader);
    const get = await request(app).get(`${ana.base}/recurrences/${body.id}`).set(joao.authHeader);
    const gen = await request(app).post(`${ana.base}/recurrences/materialize`).set(joao.authHeader);
    for (const res of [list, get, gen]) expect(res.status).toBe(404);

    const anonymous = await request(app).get(`${ana.base}/recurrences`);
    expect(anonymous.status).toBe(401);
  });
});

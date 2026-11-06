import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { createAccount, createCategory, createTestUser, createTransaction } from "./helpers/users.js";

let ana;
let pedro;

beforeAll(async () => {
  ana = await createTestUser({ name: "Ana Categorias" });
  pedro = await createTestUser({ name: "Pedro Categorias" });
});

describe("Categorias — CRUD", () => {
  it("cria, lista com filtro, edita e exclui", async () => {
    const create = await request(app)
      .post(`${ana.base}/categories`)
      .set(ana.authHeader)
      .send({ name: "Salário", type: "income", color: "#00AA55", icon: "wallet" });
    expect(create.status).toBe(201);
    expect(create.body).toMatchObject({ name: "Salário", type: "income", color: "#00AA55", icon: "wallet" });

    const expense = await createCategory(ana, { name: "Mercado", type: "expense" });

    const incomes = await request(app).get(`${ana.base}/categories?type=income`).set(ana.authHeader);
    expect(incomes.status).toBe(200);
    expect(incomes.body.every((c) => c.type === "income")).toBe(true);
    expect(incomes.body.map((c) => c.id)).toContain(create.body.id);
    expect(incomes.body.map((c) => c.id)).not.toContain(expense.id);

    const patch = await request(app)
      .patch(`${ana.base}/categories/${expense.id}`)
      .set(ana.authHeader)
      .send({ name: "Supermercado", color: null });
    expect(patch.status).toBe(200);
    expect(patch.body).toMatchObject({ name: "Supermercado", color: null });

    const del = await request(app).delete(`${ana.base}/categories/${expense.id}`).set(ana.authHeader);
    expect(del.status).toBe(204);

    const get = await request(app).get(`${ana.base}/categories/${expense.id}`).set(ana.authHeader);
    expect(get.status).toBe(404);
  });

  it("recusa categoria duplicada (mesmo nome e tipo) com 409", async () => {
    await createCategory(ana, { name: "Aluguel", type: "expense" });
    const res = await request(app)
      .post(`${ana.base}/categories`)
      .set(ana.authHeader)
      .send({ name: "Aluguel", type: "expense" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("permite o mesmo nome com tipo diferente", async () => {
    await createCategory(ana, { name: "Outros", type: "expense" });
    const res = await request(app)
      .post(`${ana.base}/categories`)
      .set(ana.authHeader)
      .send({ name: "Outros", type: "income" });

    expect(res.status).toBe(201);
  });

  it("categoria com lançamentos não pode ser excluída nem mudar de tipo (409)", async () => {
    const account = await createAccount(ana);
    const category = await createCategory(ana, { type: "expense" });
    await createTransaction(ana, {
      type: "expense",
      description: "Compra",
      amount: 30,
      account_id: account.id,
      category_id: category.id,
    });

    const del = await request(app).delete(`${ana.base}/categories/${category.id}`).set(ana.authHeader);
    expect(del.status).toBe(409);
    expect(del.body.error.code).toBe("RESOURCE_IN_USE");

    const patch = await request(app)
      .patch(`${ana.base}/categories/${category.id}`)
      .set(ana.authHeader)
      .send({ type: "income" });
    expect(patch.status).toBe(409);
  });
});

describe("Categorias — validação", () => {
  it("recusa tipo transfer e cor inválida (400)", async () => {
    const res = await request(app)
      .post(`${ana.base}/categories`)
      .set(ana.authHeader)
      .send({ name: "X", type: "transfer", color: "vermelho" });

    expect(res.status).toBe(400);
    const fields = res.body.error.details.map((d) => d.path);
    expect(fields).toEqual(expect.arrayContaining(["type", "color"]));
  });

  it("recusa filtro de tipo inválido (400)", async () => {
    const res = await request(app).get(`${ana.base}/categories?type=abc`).set(ana.authHeader);

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].in).toBe("query");
  });
});

describe("Categorias — isolamento entre households (RLS)", () => {
  it("outro usuário não acessa as categorias (404)", async () => {
    const category = await createCategory(ana);

    const list = await request(app).get(`${ana.base}/categories`).set(pedro.authHeader);
    const get = await request(app).get(`${pedro.base}/categories/${category.id}`).set(pedro.authHeader);
    const del = await request(app).delete(`${pedro.base}/categories/${category.id}`).set(pedro.authHeader);

    expect(list.status).toBe(404);
    expect(get.status).toBe(404);
    expect(del.status).toBe(404);
  });
});

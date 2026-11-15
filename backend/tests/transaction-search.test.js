import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { createAccount, createCategory, createTestUser, createTransaction } from "./helpers/users.js";

let ana;
let joao;
let checking;
let savings;
let undefinedCategory;
let transport;
let salary;
let joaoCategory;

beforeAll(async () => {
  ana = await createTestUser({ name: "Ana Tabela" });
  joao = await createTestUser({ name: "João Tabela" });
  checking = await createAccount(ana, { name: "Corrente" });
  savings = await createAccount(ana, { name: "Poupança", type: "savings" });
  undefinedCategory = await createCategory(ana, { name: "Indefinido", type: "expense" });
  transport = await createCategory(ana, { name: "Combustível", type: "expense" });
  salary = await createCategory(ana, { name: "Pagamento", type: "income" });
  joaoCategory = await createCategory(joao, { name: "Do João", type: "expense" });

  const tx = (body) => createTransaction(ana, { account_id: checking.id, type: "expense", category_id: undefinedCategory.id, ...body });
  await tx({ description: "AÇOUGUE SERRA ALTA", amount: 69.67, due_date: "2026-10-20", payment_date: "2026-10-20" });
  await tx({ description: "Posto Z22", amount: 237.25, due_date: "2026-10-14", payment_date: "2026-10-14" });
  await tx({ description: "POSTO LINHA VERDE", amount: 228.49, due_date: "2026-10-31" });
  await tx({ description: "Loja; com ponto e vírgula", amount: 10, due_date: "2026-09-02", payment_date: "2026-09-02" });
  await tx({ type: "income", category_id: salary.id, description: "Salário", amount: 5000, due_date: "2026-10-05", payment_date: "2026-10-05" });
  await tx({ type: "transfer", category_id: null, destination_account_id: savings.id, description: "Guardar", amount: 500, due_date: "2026-10-06", payment_date: "2026-10-06" });
});

const search = (query, user = ana) => request(app).get(`${user.base}/transactions/search?${query}`).set(user.authHeader);
const names = (res) => res.body.data.map((row) => row.description);

describe("Tabela de lançamentos — busca", () => {
  it("devolve os lançamentos com os nomes, a situação, a paginação e os totais", async () => {
    const res = await search("from=2026-10-01&to=2026-10-31");

    expect(res.status).toBe(200);
    expect(res.body.pagination).toEqual({ total: 5, limit: 50, offset: 0 });
    expect(res.body.totals).toEqual({ count: 5, income: 5000, expense: 535.41, transfer: 500 });
    // Padrão: data, da mais recente para a mais antiga
    expect(names(res)).toEqual(["POSTO LINHA VERDE", "AÇOUGUE SERRA ALTA", "Posto Z22", "Guardar", "Salário"]);
    expect(res.body.data.find((row) => row.description === "Guardar")).toMatchObject({
      type: "transfer",
      account_name: "Corrente",
      destination_account_name: "Poupança",
      category_name: null,
      status: "paid",
    });
    expect(res.body.data[0]).toMatchObject({ category_name: "Indefinido", status: "pending", amount: 228.49 });
  });

  it("busca na descrição sem diferenciar maiúsculas nem acentos", async () => {
    expect(names(await search("q=acougue"))).toEqual(["AÇOUGUE SERRA ALTA"]);
    expect(names(await search("q=posto&sort=date&order=asc"))).toEqual(["Posto Z22", "POSTO LINHA VERDE"]);
  });

  it("filtra por várias categorias, sem categoria, conta, tipo, situação e valor", async () => {
    expect(names(await search(`category=none`))).toEqual(["Guardar"]);
    expect(names(await search(`category=${salary.id},none&sort=description&order=asc`))).toEqual(["Guardar", "Salário"]);
    expect(names(await search(`account=${savings.id}`))).toEqual(["Guardar"]);
    expect(names(await search("type=expense&status=pending"))).toEqual(["POSTO LINHA VERDE"]);
    expect(names(await search("min=200&max=500&sort=amount&order=asc"))).toEqual(["POSTO LINHA VERDE", "Posto Z22", "Guardar"]);
  });

  it("ordena por qualquer coluna e pagina", async () => {
    const byAmount = await search("sort=amount&order=desc&limit=2");
    expect(names(byAmount)).toEqual(["Salário", "Guardar"]);
    expect(byAmount.body.pagination).toEqual({ total: 6, limit: 2, offset: 0 });

    const next = await search("sort=amount&order=desc&limit=2&offset=2");
    expect(names(next)).toEqual(["Posto Z22", "POSTO LINHA VERDE"]);

    const byCategory = await search("sort=category&order=asc&type=expense,income");
    expect(byCategory.body.data.map((row) => row.category_name)).toEqual([
      "Indefinido",
      "Indefinido",
      "Indefinido",
      "Indefinido",
      "Pagamento",
    ]);
  });

  it("valida os filtros (400)", async () => {
    const cases = {
      "from=2026-11-01&to=2026-10-01": "to",
      "min=100&max=10": "max",
      "type=expense,qualquer": "type",
      "category=123": "category",
      "sort=valor": "sort",
      "limit=500": "limit",
    };
    for (const [query, field] of Object.entries(cases)) {
      const res = await search(query);
      expect(res.status, query).toBe(400);
      expect(res.body.error.details.map((d) => d.path.split(".")[0]), query).toContain(field);
    }
  });
});

describe("Tabela de lançamentos — troca de categoria em lote", () => {
  it("troca pelos ids e conta os que ficaram de fora (outro tipo)", async () => {
    const all = await search("q=posto");
    const income = await search("q=salario");
    const res = await request(app)
      .post(`${ana.base}/transactions/recategorize`)
      .set(ana.authHeader)
      .send({ category_id: transport.id, ids: [...all.body.data.map((r) => r.id), income.body.data[0].id] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ updated: 2, skipped: 1 });
    expect((await search(`category=${transport.id}`)).body.totals.count).toBe(2);
  });

  it("troca todos os que passam num filtro", async () => {
    const res = await request(app)
      .post(`${ana.base}/transactions/recategorize`)
      .set(ana.authHeader)
      .send({ category_id: undefinedCategory.id, filter: { q: "posto" } });

    expect(res.body).toEqual({ updated: 2, skipped: 0 });
    expect((await search(`category=${transport.id}`)).body.totals.count).toBe(0);
  });

  it("recusa categoria de outro espaço (404) e pedido sem ids nem filtro, ou com os dois (400)", async () => {
    const foreign = await request(app)
      .post(`${ana.base}/transactions/recategorize`)
      .set(ana.authHeader)
      .send({ category_id: joaoCategory.id, filter: { q: "posto" } });
    expect(foreign.status).toBe(404);

    const neither = await request(app).post(`${ana.base}/transactions/recategorize`).set(ana.authHeader).send({ category_id: transport.id });
    const both = await request(app)
      .post(`${ana.base}/transactions/recategorize`)
      .set(ana.authHeader)
      .send({ category_id: transport.id, ids: [transport.id], filter: {} });
    for (const res of [neither, both]) expect(res.status).toBe(400);
  });
});

describe("Tabela de lançamentos — CSV", () => {
  it("exporta o filtro no formato do Excel em português", async () => {
    const res = await request(app).get(`${ana.base}/transactions/export?from=2026-09-01&to=2026-10-14&sort=date&order=asc`).set(ana.authHeader);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("text/csv; charset=utf-8");
    expect(res.headers["content-disposition"]).toContain("lancamentos.csv");
    const lines = res.text.replace(/^﻿/, "").trim().split("\r\n");
    expect(res.text.startsWith("﻿")).toBe(true);
    expect(lines).toEqual([
      "Data;Descrição;Categoria;Conta;Conta de destino;Tipo;Valor;Situação;Pago em",
      '02/09/2026;"Loja; com ponto e vírgula";Indefinido;Corrente;;Despesa;-10,00;Pago;02/09/2026',
      "05/10/2026;Salário;Pagamento;Corrente;;Receita;5000,00;Pago;05/10/2026",
      "06/10/2026;Guardar;;Corrente;Poupança;Transferência;500,00;Pago;06/10/2026",
      "14/10/2026;Posto Z22;Indefinido;Corrente;;Despesa;-237,25;Pago;14/10/2026",
    ]);
  });
});

describe("Tabela de lançamentos — acesso", () => {
  it("outra pessoa não busca, não troca e não exporta no espaço alheio (404); exige token (401)", async () => {
    const list = await request(app).get(`${ana.base}/transactions/search`).set(joao.authHeader);
    const csv = await request(app).get(`${ana.base}/transactions/export`).set(joao.authHeader);
    const bulk = await request(app)
      .post(`${ana.base}/transactions/recategorize`)
      .set(joao.authHeader)
      .send({ category_id: transport.id, filter: {} });
    for (const res of [list, csv, bulk]) expect(res.status).toBe(404);

    expect((await request(app).get(`${ana.base}/transactions/search`)).status).toBe(401);
  });
});

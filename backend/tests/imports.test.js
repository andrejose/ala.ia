import { readFileSync } from "node:fs";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { createAccount, createCategory, createTestUser, createTransaction } from "./helpers/users.js";

// Extratos fictícios, no mesmo formato que cada banco exporta
const fixture = (name) => readFileSync(new URL(`./fixtures/extratos/${name}`, import.meta.url), "utf8");
// O BB exporta em Latin-1: o teste manda os bytes como o banco manda
const bbFile = Buffer.from(fixture("bb.csv"), "latin1");
const santanderFile = Buffer.from(fixture("santander.csv"), "utf8");
const nubankFile = Buffer.from(fixture("nubank-fatura.csv"), "utf8");

function preview(user, accountId, file) {
  return request(app)
    .post(`${user.base}/imports/preview?account_id=${accountId}`)
    .set(user.authHeader)
    .set("Content-Type", "text/csv")
    .send(file);
}

function commit(user, accountId, rows) {
  return request(app).post(`${user.base}/imports`).set(user.authHeader).send({ account_id: accountId, rows });
}

// Linhas marcadas da prévia, com uma categoria para cada tipo, no formato da gravação
function chosen(previewBody, categories) {
  return previewBody.rows
    .filter((row) => row.selected)
    .map(({ import_hash, date, description, amount, type, category_id }) => ({
      import_hash,
      date,
      description,
      amount,
      type,
      category_id: category_id ?? categories[type],
    }));
}

let ana;
let bruno;
let categories;

beforeAll(async () => {
  ana = await createTestUser({ name: "Ana Importa" });
  bruno = await createTestUser({ name: "Bruno Importa" });
  categories = {
    expense: (await createCategory(ana, { name: "Diversos", type: "expense" })).id,
    income: (await createCategory(ana, { name: "Entradas", type: "income" })).id,
  };
});

describe("Importação — leitura dos extratos", () => {
  it("BB: reconhece o arquivo em Latin-1, ignora as linhas de saldo e desmarca o Rende Fácil", async () => {
    const account = await createAccount(ana, { name: "BB" });
    const res = await preview(ana, account.id, bbFile);

    expect(res.status).toBe(200);
    expect(res.body.source).toEqual({ id: "bb-csv", label: "Banco do Brasil (CSV)", kind: "checking" });
    expect(res.body.kind_mismatch).toBe(false);
    expect(res.body.summary).toEqual({ total: 6, new: 6, imported: 0, similar: 0 });
    expect(res.body.rows.map(({ date, description, amount, type, selected }) => ({ date, description, amount, type, selected }))).toEqual([
      { date: "2026-11-03", description: "PADARIA PAO QUENTE", amount: 39.99, type: "expense", selected: true },
      { date: "2026-11-03", description: "Pix - Enviado · PIZZARIA BELLA LTDA", amount: 66, type: "expense", selected: true },
      { date: "2026-11-03", description: "Pix - Enviado · PIZZARIA BELLA LTDA", amount: 66, type: "expense", selected: true },
      { date: "2026-11-03", description: "Tarifa Pacote de Serviços · Tarifa mensal", amount: 1234.56, type: "expense", selected: true },
      { date: "2026-11-03", description: "BB Rende Fácil · Rende Facil", amount: 1306.55, type: "income", selected: false },
      { date: "2026-11-05", description: "Pix - Recebido · EMPRESA EXEMPLO SA", amount: 2500, type: "income", selected: true },
    ]);
    expect(res.body.rows[4].note).toMatch(/Rende Fácil/);
    // Duas linhas iguais no mesmo dia não viram a mesma
    expect(res.body.rows[1].import_hash).not.toBe(res.body.rows[2].import_hash);
  });

  it("Santander: pula o cabeçalho do cliente e lê os valores com R$", async () => {
    const account = await createAccount(ana, { name: "Santander" });
    const res = await preview(ana, account.id, santanderFile);

    expect(res.status).toBe(200);
    expect(res.body.source.id).toBe("santander-csv");
    expect(res.body.rows.map(({ description, amount, type }) => [description, amount, type])).toEqual([
      ["Remuneracao aplicacao automatica", 0.03, "income"],
      ["Pix enviado · Pet Shop Exemplo", 2800, "expense"],
      ["Liquido de vencimento · Cnpj 00000000000100", 3800, "income"],
    ]);
  });

  it("Nubank: na fatura, compra é despesa, estorno é receita e o pagamento vem desmarcado", async () => {
    const card = await createAccount(ana, { name: "Cartão Nubank", type: "credit_card" });
    const res = await preview(ana, card.id, nubankFile);

    expect(res.status).toBe(200);
    expect(res.body.source.kind).toBe("credit_card");
    expect(res.body.kind_mismatch).toBe(false);
    expect(res.body.rows.map(({ description, amount, type, selected }) => [description, amount, type, selected])).toEqual([
      ["Posto Exemplo", 228.49, "expense", true],
      ['IOF de "Assinatura Exemplo"', 4, "expense", true],
      ["Assinatura Exemplo", 114.4, "expense", true],
      ["Pagamento recebido", 3339.7, "income", false],
      ["Estorno Loja Exemplo", 50, "income", true],
    ]);
    expect(res.body.rows[3].note).toMatch(/transferência/);
  });

  it("avisa quando a fatura do cartão vai para uma conta que não é cartão", async () => {
    const account = await createAccount(ana, { name: "Corrente" });
    const res = await preview(ana, account.id, nubankFile);

    expect(res.status).toBe(200);
    expect(res.body.kind_mismatch).toBe(true);
  });
});

describe("Importação — gravação e duplicatas", () => {
  it("grava as linhas escolhidas como lançamentos pagos e reimportar não duplica", async () => {
    const account = await createAccount(ana, { name: "BB Gravação", initial_balance: 0 });
    const first = await preview(ana, account.id, bbFile);
    const rows = chosen(first.body, categories);

    const saved = await commit(ana, account.id, rows);
    expect(saved.status).toBe(201);
    expect(saved.body).toEqual({ imported: 5, skipped: 0 });

    const balance = await request(app).get(`${ana.base}/accounts/${account.id}`).set(ana.authHeader);
    expect(balance.body.current_balance).toBe(1093.45); // 2.500,00 - 39,99 - 66,00 - 66,00 - 1.234,56

    const list = await request(app).get(`${ana.base}/transactions?account_id=${account.id}`).set(ana.authHeader);
    expect(list.body.data).toHaveLength(5);
    expect(list.body.data.every((tx) => tx.payment_date === tx.due_date)).toBe(true);

    // Mesmo arquivo de novo: tudo aparece como já importado e nada vem marcado
    const again = await preview(ana, account.id, bbFile);
    expect(again.body.summary).toMatchObject({ new: 1, imported: 5 });
    expect(again.body.rows.filter((row) => row.selected)).toEqual([]);

    // Reenviar a mesma gravação não duplica
    const resend = await commit(ana, account.id, rows);
    expect(resend.body).toEqual({ imported: 0, skipped: 5 });
  });

  it("marca como parecido o que já foi lançado à mão (mesma data e valor) e não o deixa marcado", async () => {
    const account = await createAccount(ana, { name: "Santander Manual" });
    await createTransaction(ana, {
      type: "expense",
      description: "Pet shop",
      amount: 2800,
      account_id: account.id,
      category_id: categories.expense,
      due_date: "2026-11-03",
      payment_date: "2026-11-03",
    });

    const res = await preview(ana, account.id, santanderFile);
    const petShop = res.body.rows.find((row) => row.description.includes("Pet Shop"));
    expect(petShop).toMatchObject({ status: "similar", selected: false });
    expect(res.body.summary.similar).toBe(1);
  });

  it("sugere a categoria já usada numa descrição parecida", async () => {
    const pizza = await createCategory(ana, { name: "Delivery", type: "expense" });
    const account = await createAccount(ana, { name: "BB Sugestão" });
    await createTransaction(ana, {
      type: "expense",
      description: "Pix - Enviado · PIZZARIA BELLA LTDA",
      amount: 10,
      account_id: account.id,
      category_id: pizza.id,
      due_date: "2026-10-01",
      payment_date: "2026-10-01",
    });

    const res = await preview(ana, account.id, bbFile);
    const pizzas = res.body.rows.filter((row) => row.description.includes("PIZZARIA"));
    expect(pizzas.map((row) => row.category_id)).toEqual([pizza.id, pizza.id]);
  });

  it("recusa categoria do tipo errado e não grava nada (tudo ou nada)", async () => {
    const account = await createAccount(ana, { name: "BB Tudo ou Nada" });
    const res = await preview(ana, account.id, bbFile);
    const rows = chosen(res.body, categories);
    rows[rows.length - 1].category_id = categories.expense; // receita com categoria de despesa

    const saved = await commit(ana, account.id, rows);
    expect(saved.status).toBe(400);
    expect(saved.body.error.code).toBe("INVALID_REFERENCE");

    const list = await request(app).get(`${ana.base}/transactions?account_id=${account.id}`).set(ana.authHeader);
    expect(list.body.data).toHaveLength(0);
  });
});

describe("Importação — erros", () => {
  it("recusa arquivo vazio, formato desconhecido e linha quebrada (400)", async () => {
    const account = await createAccount(ana);

    const empty = await preview(ana, account.id, Buffer.alloc(0));
    expect(empty.status).toBe(400);

    const unknown = await preview(ana, account.id, Buffer.from(fixture("desconhecido.csv")));
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.code).toBe("UNSUPPORTED_FORMAT");
    expect(unknown.body.error.message).toContain("Banco do Brasil");

    const broken = Buffer.from('date,title,amount\n2026-11-01,Posto,"abc"\n');
    const res = await preview(ana, account.id, broken);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: "INVALID_FILE", message: expect.stringContaining("linha 2") });
  });

  it("valida a gravação: linhas vazias, hash inválido e sem categoria (400)", async () => {
    const account = await createAccount(ana);

    const none = await commit(ana, account.id, []);
    expect(none.status).toBe(400);

    const bad = await commit(ana, account.id, [
      { import_hash: "x", date: "2026-11-01", description: "X", amount: 1, type: "expense" },
    ]);
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.map((d) => d.path)).toEqual(
      expect.arrayContaining(["rows.0.import_hash", "rows.0.category_id"])
    );
  });

  it("outra pessoa não lê nem grava extrato no espaço alheio (404)", async () => {
    const account = await createAccount(ana, { name: "Secreta" });
    const res = await preview(bruno, account.id, bbFile);
    const prev = await request(app)
      .post(`${ana.base}/imports/preview?account_id=${account.id}`)
      .set(bruno.authHeader)
      .set("Content-Type", "text/csv")
      .send(bbFile);
    const save = await request(app).post(`${ana.base}/imports`).set(bruno.authHeader).send({ account_id: account.id, rows: [] });

    // Na própria casa do Bruno, a conta da Ana não existe
    expect(res.status).toBe(404);
    for (const r of [prev, save]) expect(r.status).toBe(404);
  });

  it("exige token (401)", async () => {
    const res = await request(app).post(`${ana.base}/imports/preview?account_id=${ana.householdId}`).send("x");
    expect(res.status).toBe(401);
  });
});

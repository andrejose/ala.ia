import { readFileSync } from "node:fs";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { bbPdf, nubankPdf, santanderCardPdf, santanderPdf } from "./fixtures/extratos/pdfs.js";
import { buildPdf } from "./helpers/pdf.js";
import { createAccount, createCategory, createTestUser } from "./helpers/users.js";

// Extratos fictícios: os PDFs são gerados no mesmo layout de cada banco, com os
// mesmos dados dos CSVs fictícios, e os OFX seguem o formato padrão.
const file = (name, encoding = "utf8") => Buffer.from(readFileSync(new URL(`./fixtures/extratos/${name}`, import.meta.url), "utf8"), encoding);
const raw = (name) => readFileSync(new URL(`./fixtures/extratos/${name}`, import.meta.url));

let ana;
let categories;

beforeAll(async () => {
  ana = await createTestUser({ name: "Ana PDF" });
  categories = {
    expense: (await createCategory(ana, { name: "Diversos", type: "expense" })).id,
    income: (await createCategory(ana, { name: "Entradas", type: "income" })).id,
  };
});

function preview(accountId, body, contentType = "application/octet-stream") {
  return request(app)
    .post(`${ana.base}/imports/preview?account_id=${accountId}`)
    .set(ana.authHeader)
    .set("Content-Type", contentType)
    .send(body);
}

async function importAll(accountId, body) {
  const res = await preview(accountId, body);
  const rows = res.body.rows
    .filter((row) => row.selected)
    .map(({ import_hash, date, description, amount, type }) => ({ import_hash, date, description, amount, type, category_id: categories[type] }));
  const saved = await request(app).post(`${ana.base}/imports`).set(ana.authHeader).send({ account_id: accountId, rows });
  expect(saved.status).toBe(201);
  return saved.body;
}

const pick = (rows) => rows.map(({ date, description, amount, type, selected }) => ({ date, description, amount, type, selected }));

describe("Importação de PDF", () => {
  it("BB: o PDF dá as mesmas linhas (e os mesmos identificadores) do CSV do mesmo extrato", async () => {
    const account = await createAccount(ana, { name: "BB PDF" });
    const fromPdf = await preview(account.id, bbPdf(), "application/pdf");
    const fromCsv = await preview(account.id, file("bb.csv", "latin1"), "text/csv");

    expect(fromPdf.status).toBe(200);
    expect(fromPdf.body.source).toEqual({ id: "bb-pdf", label: "Banco do Brasil (PDF)", kind: "checking" });
    expect(pick(fromPdf.body.rows)).toEqual(pick(fromCsv.body.rows));
    expect(fromPdf.body.rows.map((r) => r.import_hash)).toEqual(fromCsv.body.rows.map((r) => r.import_hash));
    // O detalhe longo continua na linha de baixo; "Lançamentos Futuros" não entram
    expect(fromPdf.body.rows.at(-1).description).toBe("Pix - Recebido · EMPRESA EXEMPLO SA");
    expect(fromPdf.body.rows).toHaveLength(6);
  });

  it("BB: importar o CSV e depois o PDF do mesmo extrato não duplica nada", async () => {
    const account = await createAccount(ana, { name: "BB CSV depois PDF" });
    await importAll(account.id, file("bb.csv", "latin1"));

    const res = await preview(account.id, bbPdf());
    expect(res.body.summary).toMatchObject({ imported: 5 });
    expect(res.body.rows.filter((row) => row.selected)).toEqual([]);
  });

  it("Santander: lê as linhas de uma e de três linhas; o que entrou pelo CSV aparece como já importado ou parecido", async () => {
    const account = await createAccount(ana, { name: "Santander PDF" });
    const first = await preview(account.id, santanderPdf());

    expect(first.status).toBe(200);
    expect(first.body.source.id).toBe("santander-pdf");
    expect(first.body.rows.map(({ description, amount, type }) => [description, amount, type])).toEqual([
      ["Remuneracao aplicacao automatica", 0.03, "income"],
      ["Pix enviado · Pet Shop Exemplo", 2800, "expense"],
      ["Liquido de vencimento · Fundacao Exemplo", 3800, "income"],
    ]);

    await importAll(account.id, file("santander.csv"));
    const again = await preview(account.id, santanderPdf());
    expect(again.body.rows.map((row) => row.status)).toEqual(["imported", "imported", "similar"]);
    expect(again.body.rows.filter((row) => row.selected)).toEqual([]);
  });

  it("Nubank: lê a fatura, deduz o ano e desmarca o pagamento", async () => {
    const card = await createAccount(ana, { name: "Cartão PDF", type: "credit_card" });
    const res = await preview(card.id, nubankPdf());

    expect(res.status).toBe(200);
    expect(res.body.source.id).toBe("nubank-card-pdf");
    expect(pick(res.body.rows)).toEqual([
      { date: "2026-11-01", description: "Posto Exemplo", amount: 228.49, type: "expense", selected: true },
      { date: "2026-10-30", description: 'IOF de "Assinatura Exemplo"', amount: 4, type: "expense", selected: true },
      { date: "2026-10-30", description: "Assinatura Exemplo", amount: 114.4, type: "expense", selected: true },
      { date: "2026-10-13", description: "Pagamento em 13 OUT", amount: 3339.7, type: "income", selected: false },
      { date: "2026-10-10", description: "Estorno Loja Exemplo", amount: 50, type: "income", selected: true },
    ]);
    // O IOF continua ligado à compra
    expect(res.body.rows[1].follows).toBe(res.body.rows[2].import_hash);
    // Mesmas compras do CSV, mesmos identificadores
    const csv = await preview(card.id, file("nubank-fatura.csv"));
    const csvHashes = new Set(csv.body.rows.map((r) => r.import_hash));
    expect(res.body.rows.filter((r) => csvHashes.has(r.import_hash))).toHaveLength(4);
  });

  it("Nubank: compra de dezembro na fatura de janeiro é do ano anterior", async () => {
    const card = await createAccount(ana, { name: "Cartão Virada", type: "credit_card" });
    const pdf = nubankPdf({ invoice: "13 JAN 2027", rows: [["28 DEZ", "•••• 1234", "Ceia Exemplo", "R$ 300,00"], ["02 JAN", null, "Padaria Exemplo", "R$ 12,00"]] });
    const res = await preview(card.id, pdf);

    expect(res.body.rows.map((r) => r.date)).toEqual(["2026-12-28", "2027-01-02"]);
  });

  it("Santander, fatura do cartão: lê as duas colunas, cartões adicionais e parcelas", async () => {
    const card = await createAccount(ana, { name: "Cartão Santander", type: "credit_card" });
    const res = await preview(card.id, santanderCardPdf());

    expect(res.status).toBe(200);
    expect(res.body.source).toEqual({ id: "santander-card-pdf", label: "Fatura do cartão Santander (PDF)", kind: "credit_card" });
    expect(pick(res.body.rows)).toEqual([
      { date: "2026-10-08", description: "DEB AUTOM DE FATURA EM C/", amount: 1000, type: "income", selected: false },
      { date: "2026-10-02", description: "MERCADO EXEMPLO", amount: 61.16, type: "expense", selected: true },
      { date: "2026-10-14", description: "POSTO EXEMPLO LTDA", amount: 237.25, type: "expense", selected: true },
      // Parcela 2 em diante entra na data do fechamento, com a parcela na descrição
      { date: "2026-10-30", description: "LOJA PARCELADA - Parcela 02/12", amount: 9.99, type: "expense", selected: true },
      { date: "2026-10-30", description: "PET EXEMPLO*OR1 - Parcela 02/03", amount: 141.58, type: "expense", selected: true },
      { date: "2026-10-04", description: "LOJA NOVA - Parcela 01/02", amount: 27.81, type: "expense", selected: true },
      { date: "2026-09-30", description: "MERCADOLIVRE*EXEMPLO", amount: 22.9, type: "expense", selected: true },
      { date: "2026-10-18", description: "ASAAS *FOTO", amount: 9.51, type: "expense", selected: true },
    ]);
    // As despesas somam o total da fatura (anuidade zerada e linhas de total fora)
    const spent = res.body.rows.filter((r) => r.type === "expense").reduce((sum, r) => sum + r.amount, 0);
    expect(Math.round(spent * 100) / 100).toBe(510.2);
  });

  it("Santander, fatura do cartão: compra de dezembro na fatura que vence em janeiro", async () => {
    const card = await createAccount(ana, { name: "Cartão Santander Virada", type: "credit_card" });
    const res = await preview(card.id, santanderCardPdf({ closing: "30/12", due: "08/01/2027" }));

    expect(res.body.rows.find((r) => r.description === "MERCADO EXEMPLO").date).toBe("2026-10-02");
    expect(res.body.rows.find((r) => r.description.startsWith("PET EXEMPLO")).date).toBe("2026-12-30");
  });

  it("recusa PDF corrompido e PDF de outro banco (400)", async () => {
    const account = await createAccount(ana);

    const broken = await preview(account.id, Buffer.from("%PDF-1.4\nnão é um pdf de verdade"));
    expect(broken.status).toBe(400);
    expect(broken.body.error.code).toBe("INVALID_FILE");

    const other = await preview(account.id, buildPdf([[{ x: 50, y: 700, text: "Extrato do Banco Exemplo" }]]));
    expect(other.status).toBe(400);
    expect(other.body.error).toMatchObject({ code: "UNSUPPORTED_FORMAT", message: expect.stringContaining("PDF") });
  });
});

describe("Importação de OFX", () => {
  it("extrato de conta (SGML em Latin-1): usa o FITID do banco e reimportar não duplica", async () => {
    const account = await createAccount(ana, { name: "Conta OFX" });
    const res = await preview(account.id, raw("conta.ofx"));

    expect(res.status).toBe(200);
    expect(res.body.source).toMatchObject({ id: "ofx-bank", kind: "checking" });
    expect(pick(res.body.rows)).toEqual([
      { date: "2026-11-03", description: "Compra com Cartão PADARIA PÃO QUENTE", amount: 39.99, type: "expense", selected: true },
      { date: "2026-11-03", description: "Pix - Enviado PIZZARIA BELLA", amount: 66, type: "expense", selected: true },
      { date: "2026-11-03", description: "Pix - Enviado PIZZARIA BELLA", amount: 66, type: "expense", selected: true },
      { date: "2026-11-05", description: "EMPRESA EXEMPLO SA", amount: 2500, type: "income", selected: true },
    ]);

    expect(await importAll(account.id, raw("conta.ofx"))).toEqual({ imported: 4, skipped: 0 });
    const again = await preview(account.id, raw("conta.ofx"));
    expect(again.body.summary).toMatchObject({ new: 0, imported: 4 });
  });

  it("fatura de cartão (XML): pagamento desmarcado e aviso de conta errada", async () => {
    const card = await createAccount(ana, { name: "Cartão OFX", type: "credit_card" });
    const res = await preview(card.id, raw("cartao.ofx"));

    expect(res.body.source).toMatchObject({ id: "ofx-card", kind: "credit_card" });
    expect(res.body.kind_mismatch).toBe(false);
    expect(pick(res.body.rows)).toEqual([
      { date: "2026-10-30", description: "Assinatura Exemplo", amount: 114.4, type: "expense", selected: true },
      { date: "2026-10-13", description: "Pagamento recebido", amount: 3339.7, type: "income", selected: false },
    ]);

    const checking = await createAccount(ana, { name: "Corrente OFX" });
    const mismatch = await preview(checking.id, raw("cartao.ofx"));
    expect(mismatch.body.kind_mismatch).toBe(true);
  });
});

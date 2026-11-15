import { MAX_BULK, MAX_EXPORT, searchParams, SORT_COLUMNS } from "../schemas/transactionSearch.schemas.js";

// Tabela de lançamentos: busca com filtros e ordenação, totais do filtro,
// troca de categoria em lote e exportação em CSV. A filtragem é a função
// search_transactions do banco; a ordem e a paginação vêm do PostgREST.

const round = (value) => Math.round(Number(value) * 100) / 100;

function search(supabase, householdId, query, options) {
  const column = SORT_COLUMNS[query.sort];
  const ascending = query.order === "asc";
  return supabase
    .rpc("search_transactions", searchParams(householdId, query), options)
    .order(column, { ascending, nullsFirst: false })
    // Desempate estável: mais recentes primeiro, depois o id
    .order("due_date", { ascending: false })
    .order("id", { ascending: true });
}

function toRow(row) {
  return { ...row, amount: round(row.amount) };
}

// GET /households/:householdId/transactions/search
export async function list(req, res) {
  const query = req.validated.query;
  const householdId = req.household.id;

  const [page, totals] = await Promise.all([
    search(req.supabase, householdId, query, { count: "exact" }).range(query.offset, query.offset + query.limit - 1),
    req.supabase.rpc("search_transactions_totals", searchParams(householdId, query)).single(),
  ]);
  if (page.error) throw page.error;
  if (totals.error) throw totals.error;

  res.status(200).json({
    data: page.data.map(toRow),
    pagination: { total: page.count, limit: query.limit, offset: query.offset },
    totals: {
      count: Number(totals.data.count),
      income: round(totals.data.income),
      expense: round(totals.data.expense),
      transfer: round(totals.data.transfer),
    },
  });
}

// POST /households/:householdId/transactions/recategorize
// { category_id, ids: [...] } ou { category_id, filter: { ...filtros da busca } }
export async function recategorize(req, res) {
  const { category_id, ids, filter } = req.validated.body;
  const householdId = req.household.id;

  let chosen = ids;
  if (filter) {
    const { data, error } = await req.supabase
      .rpc("search_transactions", searchParams(householdId, filter))
      .select("id")
      .range(0, MAX_BULK - 1);
    if (error) throw error;
    chosen = data.map((row) => row.id);
  }
  if (chosen.length === 0) return res.status(200).json({ updated: 0, skipped: 0 });

  const { data, error } = await req.supabase
    .rpc("recategorize_transactions", { p_household_id: householdId, p_ids: chosen, p_category_id: category_id })
    .single();
  if (error) throw error;

  res.status(200).json({ updated: data.updated, skipped: data.skipped });
}

// CSV no formato que o Excel em português abre direto: separador ";",
// vírgula decimal e BOM para os acentos
const TYPE_LABEL = { income: "Receita", expense: "Despesa", transfer: "Transferência" };

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const brDate = (iso) => (iso ? iso.split("-").reverse().join("/") : "");
const brNumber = (value) => round(value).toFixed(2).replace(".", ",");

// GET /households/:householdId/transactions/export
export async function exportCsv(req, res) {
  const query = req.validated.query;
  const { data, error } = await search(req.supabase, req.household.id, query).range(0, MAX_EXPORT - 1);
  if (error) throw error;

  const header = ["Data", "Descrição", "Categoria", "Conta", "Conta de destino", "Tipo", "Valor", "Situação", "Pago em"];
  const lines = data.map((row) =>
    [
      brDate(row.due_date),
      row.description,
      row.category_name,
      row.account_name,
      row.destination_account_name,
      TYPE_LABEL[row.type],
      // Sinal do ponto de vista do bolso: despesa negativa, receita positiva
      brNumber(row.type === "expense" ? -row.amount : row.amount),
      row.status === "paid" ? "Pago" : "Pendente",
      brDate(row.payment_date),
    ]
      .map(csvCell)
      .join(";")
  );

  res
    .status(200)
    .type("text/csv; charset=utf-8")
    .attachment("lancamentos.csv")
    .send(`﻿${[header.join(";"), ...lines].join("\r\n")}\r\n`);
}

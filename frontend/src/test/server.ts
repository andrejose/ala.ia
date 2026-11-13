import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import type {
  Account,
  AuthResponse,
  Category,
  Household,
  ImportPreview,
  Invitation,
  Me,
  Member,
  MyInvitation,
  Recurrence,
  ReportByCategory,
  ReportSummary,
  Transaction,
} from "../lib/types";

// =============================================================================
// API simulada para os testes (MSW)
//
// Cada teste começa com o mesmo "banco" em memória (resetDb). Para mudar uma
// resposta num teste, use server.use(...) com um handler próprio; para olhar o
// que o app enviou, use os arrays de db.requests.
// =============================================================================

export const user = { id: "u1", email: "maria@exemplo.com", name: "Maria Silva", created_at: "2026-11-01T10:00:00Z" };

export const personal: Household = {
  id: "h1",
  name: "Pessoal",
  role: "owner",
  created_at: "2026-11-01T10:00:00Z",
  updated_at: "2026-11-01T10:00:00Z",
};

export const auth: AuthResponse = {
  user,
  session: {
    access_token: "access-token",
    refresh_token: "refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: 4_102_444_800,
  },
};

function initialDb() {
  return {
    households: [personal] as Household[],
    accounts: [
      { id: "a1", household_id: "h1", name: "Conta corrente", type: "checking", is_active: true, initial_balance: 1000, current_balance: 1000 },
      { id: "a2", household_id: "h1", name: "Carteira", type: "cash", is_active: true, initial_balance: 50, current_balance: 50 },
    ] as Account[],
    categories: [
      { id: "c1", household_id: "h1", name: "Mercado", type: "expense", color: null, icon: null, is_active: true },
      { id: "c2", household_id: "h1", name: "Salário", type: "income", color: null, icon: null, is_active: true },
    ] as Category[],
    transactions: [] as Transaction[],
    recurrences: [] as Recurrence[],
    // Quantos lançamentos o "gerar recorrentes" diz ter criado
    materialized: 0,
    invitations: [] as Invitation[],
    myInvitations: [] as MyInvitation[],
    members: [{ user_id: "u1", name: "Maria Silva", role: "owner", joined_at: "2026-11-01T10:00:00Z" }] as Member[],
    // Relatórios: totais por mês ("YYYY-MM") e categorias por "YYYY-MM:tipo".
    // Mês que não está aqui volta zerado.
    reports: {
      months: {} as Record<string, MonthTotals>,
      byCategory: {} as Record<string, ReportByCategory["categories"]>,
    },
    // O que o app enviou nas mutações, para os testes conferirem
    requests: {
      transactions: [] as unknown[],
      invitations: [] as unknown[],
      categories: [] as unknown[],
      accounts: [] as unknown[],
      imports: [] as unknown[],
      recurrences: [] as unknown[],
      materialize: 0,
      // Arquivos enviados para a prévia: { account_id, text }
      importFiles: [] as unknown[],
    },
    // Resposta da prévia da importação (cada teste monta a sua)
    importPreview: null as Omit<ImportPreview, "account"> | null,
  };
}

export interface MonthTotals {
  income: { paid: number; pending: number };
  expense: { paid: number; pending: number };
}

export let db = initialDb();

// Resumo de um mês no formato da API, a partir de db.reports.months
function monthReport(month: string): ReportSummary {
  const totals = db.reports.months[month] ?? { income: { paid: 0, pending: 0 }, expense: { paid: 0, pending: 0 } };
  const income = { ...totals.income, total: totals.income.paid + totals.income.pending };
  const expense = { ...totals.expense, total: totals.expense.paid + totals.expense.pending };
  return { month, income, expense, balance: { paid: income.paid - expense.paid, total: income.total - expense.total } };
}

// "2026-09", "2026-11" -> ["2026-09", "2026-10", "2026-11"]
function monthsBetween(from: string, to: string) {
  const months: string[] = [];
  let [year, month] = from.split("-").map(Number);
  for (let current = from; current <= to; ) {
    months.push(current);
    month += 1;
    if (month > 12) [year, month] = [year + 1, 1];
    current = `${year}-${String(month).padStart(2, "0")}`;
  }
  return months;
}

export function resetDb() {
  db = initialDb();
}

export function apiError(status: number, code: string, message: string, details?: unknown) {
  return HttpResponse.json({ error: { code, message, details } }, { status });
}

const me = (): Me => ({
  id: user.id,
  name: user.name,
  email: user.email,
  created_at: user.created_at,
  updated_at: user.created_at,
  households: db.households,
});

const handlers = [
  // Autenticação
  http.post("*/api/auth/login", () => HttpResponse.json(auth)),
  http.post("*/api/auth/refresh", () => HttpResponse.json(auth)),
  http.post("*/api/auth/logout", () => new HttpResponse(null, { status: 204 })),

  // Usuário e convites recebidos
  http.get("*/api/me", () => HttpResponse.json(me())),
  http.get("*/api/invitations", () => HttpResponse.json(db.myInvitations)),
  http.post("*/api/invitations/:id/accept", ({ params }) => {
    const invitation = db.myInvitations.find((i) => i.id === params.id)!;
    const household: Household = {
      id: invitation.household_id,
      name: invitation.household_name,
      role: invitation.role,
      created_at: "2026-11-10T10:00:00Z",
      updated_at: "2026-11-10T10:00:00Z",
    };
    db.households = [...db.households, household];
    db.myInvitations = db.myInvitations.filter((i) => i.id !== params.id);
    return HttpResponse.json(household);
  }),

  // Dados do household
  http.get("*/api/households/:id/accounts", ({ params }) =>
    HttpResponse.json(db.accounts.filter((a) => a.household_id === params.id))
  ),
  http.post("*/api/households/:id/accounts", async ({ request, params }) => {
    const body = (await request.json()) as Pick<Account, "name" | "type" | "initial_balance">;
    db.requests.accounts.push(body);
    const created: Account = {
      ...body,
      id: `a${db.accounts.length + 1}`,
      household_id: String(params.id),
      is_active: true,
      current_balance: body.initial_balance,
    };
    db.accounts.push(created);
    return HttpResponse.json(created, { status: 201 });
  }),
  http.get("*/api/households/:id/categories", ({ params }) =>
    HttpResponse.json(db.categories.filter((c) => c.household_id === params.id))
  ),
  http.patch("*/api/households/:id/categories/:categoryId", async ({ request, params }) => {
    const body = (await request.json()) as Partial<Category>;
    db.requests.categories.push(body);
    const category = db.categories.find((c) => c.id === params.categoryId);
    if (!category) return apiError(404, "NOT_FOUND", "Categoria não encontrada.");
    Object.assign(category, body);
    return HttpResponse.json(category);
  }),
  http.delete("*/api/households/:id/categories/:categoryId", ({ params }) => {
    if (db.transactions.some((t) => t.category_id === params.categoryId)) {
      return apiError(409, "RESOURCE_IN_USE", "A categoria tem lançamentos: não pode ser excluída nem mudar de tipo.");
    }
    db.categories = db.categories.filter((c) => c.id !== params.categoryId);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("*/api/households/:id/transactions", ({ request }) => {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? 30);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    return HttpResponse.json({
      data: db.transactions.slice(offset, offset + limit),
      pagination: { total: db.transactions.length, limit, offset },
    });
  }),
  http.post("*/api/households/:id/transactions", async ({ request, params }) => {
    const body = (await request.json()) as Omit<Transaction, "id" | "household_id" | "user_id">;
    db.requests.transactions.push(body);
    const created: Transaction = { ...body, id: `t${db.transactions.length + 1}`, household_id: String(params.id), user_id: user.id };
    db.transactions.push(created);
    return HttpResponse.json(created, { status: 201 });
  }),
  http.get("*/api/households/:id/reports/summary", ({ request }) =>
    HttpResponse.json(monthReport(new URL(request.url).searchParams.get("month") ?? ""))
  ),
  http.get("*/api/households/:id/reports/by-category", ({ request }) => {
    const params = new URL(request.url).searchParams;
    const month = params.get("month") ?? "";
    const type = params.get("type") ?? "expense";
    const categories = db.reports.byCategory[`${month}:${type}`] ?? [];
    return HttpResponse.json({ month, type, total: categories.reduce((sum, c) => sum + c.total, 0), categories });
  }),
  http.get("*/api/households/:id/reports/monthly", ({ request }) => {
    const params = new URL(request.url).searchParams;
    const from = params.get("from") ?? "";
    const to = params.get("to") ?? "";
    return HttpResponse.json({ from, to, months: monthsBetween(from, to).map(monthReport) });
  }),
  http.post("*/api/households/:id/imports/preview", async ({ request }) => {
    const accountId = new URL(request.url).searchParams.get("account_id");
    db.requests.importFiles.push({ account_id: accountId, text: await request.text() });
    const account = db.accounts.find((a) => a.id === accountId);
    if (!account || !db.importPreview) return apiError(400, "UNSUPPORTED_FORMAT", "Não reconheci este arquivo.");
    return HttpResponse.json({ ...db.importPreview, account: { id: account.id, name: account.name, type: account.type, is_active: true } });
  }),
  http.post("*/api/households/:id/imports", async ({ request }) => {
    const body = (await request.json()) as { rows: unknown[] };
    db.requests.imports.push(body);
    return HttpResponse.json({ imported: body.rows.length, skipped: 0 }, { status: 201 });
  }),
  // Recorrentes
  http.post("*/api/households/:id/recurrences/materialize", () => {
    db.requests.materialize += 1;
    return HttpResponse.json({ generated: db.materialized });
  }),
  http.get("*/api/households/:id/recurrences", () => HttpResponse.json(db.recurrences)),
  http.post("*/api/households/:id/recurrences", async ({ request, params }) => {
    const body = (await request.json()) as Omit<Recurrence, "id" | "household_id" | "is_active" | "generated_until">;
    db.requests.recurrences.push(body);
    const created: Recurrence = {
      ...body,
      id: `r${db.recurrences.length + 1}`,
      household_id: String(params.id),
      is_active: true,
      generated_until: body.start_month,
    };
    db.recurrences.push(created);
    return HttpResponse.json({ ...created, generated: 1 }, { status: 201 });
  }),
  http.patch("*/api/households/:id/recurrences/:recurrenceId", async ({ request, params }) => {
    const body = (await request.json()) as Partial<Recurrence>;
    db.requests.recurrences.push(body);
    const recurrence = db.recurrences.find((r) => r.id === params.recurrenceId);
    if (!recurrence) return apiError(404, "NOT_FOUND", "Recurso não encontrado.");
    Object.assign(recurrence, body);
    return HttpResponse.json({ ...recurrence, generated: 0 });
  }),
  http.delete("*/api/households/:id/recurrences/:recurrenceId", ({ request, params }) => {
    db.requests.recurrences.push({ deleted: params.recurrenceId, query: new URL(request.url).search });
    db.recurrences = db.recurrences.filter((r) => r.id !== params.recurrenceId);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("*/api/households/:id/members", () => HttpResponse.json(db.members)),
  http.get("*/api/households/:id/invitations", () => HttpResponse.json(db.invitations)),
  http.post("*/api/households/:id/invitations", async ({ request, params }) => {
    const body = (await request.json()) as { email: string; role: Invitation["role"] };
    db.requests.invitations.push(body);
    const created: Invitation = {
      id: `i${db.invitations.length + 1}`,
      household_id: String(params.id),
      email: body.email,
      role: body.role,
      status: "pending",
      created_at: "2026-11-11T10:00:00Z",
      expires_at: "2026-11-18T10:00:00Z",
      invited_by: { user_id: user.id, name: user.name },
    };
    db.invitations.push(created);
    return HttpResponse.json(created, { status: 201 });
  }),
];

export const server = setupServer(...handlers);

import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import type {
  Account,
  AuthResponse,
  Category,
  Household,
  Invitation,
  Me,
  Member,
  MyInvitation,
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
    invitations: [] as Invitation[],
    myInvitations: [] as MyInvitation[],
    members: [{ user_id: "u1", name: "Maria Silva", role: "owner", joined_at: "2026-11-01T10:00:00Z" }] as Member[],
    // O que o app enviou nas mutações, para os testes conferirem
    requests: {
      transactions: [] as unknown[],
      invitations: [] as unknown[],
      categories: [] as unknown[],
    },
  };
}

export let db = initialDb();

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
    HttpResponse.json({
      month: new URL(request.url).searchParams.get("month"),
      income: { paid: 0, pending: 0, total: 0 },
      expense: { paid: 0, pending: 0, total: 0 },
      balance: { paid: 0, total: 0 },
    })
  ),
  http.get("*/api/households/:id/reports/by-category", ({ request }) =>
    HttpResponse.json({ month: new URL(request.url).searchParams.get("month"), type: "expense", total: 0, categories: [] })
  ),
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

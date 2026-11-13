import express, { Router } from "express";
import * as accounts from "../controllers/accounts.controller.js";
import * as budgets from "../controllers/budgets.controller.js";
import * as categories from "../controllers/categories.controller.js";
import * as households from "../controllers/households.controller.js";
import * as imports from "../controllers/imports.controller.js";
import * as invitations from "../controllers/invitations.controller.js";
import * as recurrences from "../controllers/recurrences.controller.js";
import * as reports from "../controllers/reports.controller.js";
import * as transactions from "../controllers/transactions.controller.js";
import { requireAuth } from "../middlewares/auth.js";
import { loadHousehold, requireOwner } from "../middlewares/household.js";
import { validate } from "../middlewares/validate.js";
import { budgetParams, upsertBudgetSchema } from "../schemas/budgets.schemas.js";
import { createAccountSchema, listAccountsQuery, updateAccountSchema } from "../schemas/accounts.schemas.js";
import { createCategorySchema, listCategoriesQuery, updateCategorySchema } from "../schemas/categories.schemas.js";
import { householdParams, idParams, invitationIdParams, userIdParams } from "../schemas/common.schemas.js";
import {
  createHouseholdSchema,
  inviteMemberSchema,
  updateHouseholdSchema,
  updateMemberSchema,
} from "../schemas/households.schemas.js";
import { commitImportSchema, MAX_IMPORT_FILE, previewQuery } from "../schemas/imports.schemas.js";
import {
  createRecurrenceSchema,
  deleteRecurrenceQuery,
  updateRecurrenceSchema,
} from "../schemas/recurrences.schemas.js";
import { byCategoryQuery, monthlyQuery, summaryQuery } from "../schemas/reports.schemas.js";
import {
  createTransactionSchema,
  listTransactionsQuery,
  updateTransactionSchema,
} from "../schemas/transactions.schemas.js";

export const householdsRoutes = Router();
householdsRoutes.use(requireAuth);

householdsRoutes.get("/", households.list);
householdsRoutes.post("/", validate({ body: createHouseholdSchema }), households.create);

// -----------------------------------------------------------------------------
// Rotas de um household: /households/:householdId/...
// loadHousehold garante que o usuário é membro (senão 404) e carrega o papel dele.
// -----------------------------------------------------------------------------
const household = Router({ mergeParams: true });
householdsRoutes.use("/:householdId", validate({ params: householdParams }), loadHousehold, household);

household.get("/", households.get);
household.patch("/", requireOwner, validate({ body: updateHouseholdSchema }), households.update);
household.delete("/", requireOwner, households.remove);

// Membros
household.get("/members", households.listMembers);
household.patch(
  "/members/:userId",
  requireOwner,
  validate({ params: userIdParams, body: updateMemberSchema }),
  households.updateMember
);
household.delete("/members/:userId", validate({ params: userIdParams }), households.removeMember);

// Convites (a pessoa só vira membro quando aceita: ver /invitations)
household.get("/invitations", invitations.listForHousehold);
household.post("/invitations", requireOwner, validate({ body: inviteMemberSchema }), invitations.create);
household.delete(
  "/invitations/:invitationId",
  requireOwner,
  validate({ params: invitationIdParams }),
  invitations.cancel
);

// Contas
household.get("/accounts", validate({ query: listAccountsQuery }), accounts.list);
household.post("/accounts", validate({ body: createAccountSchema }), accounts.create);
household.get("/accounts/:id", validate({ params: idParams }), accounts.get);
household.patch("/accounts/:id", validate({ params: idParams, body: updateAccountSchema }), accounts.update);
household.delete("/accounts/:id", validate({ params: idParams }), accounts.remove);

// Categorias
household.get("/categories", validate({ query: listCategoriesQuery }), categories.list);
household.post("/categories", validate({ body: createCategorySchema }), categories.create);
household.get("/categories/:id", validate({ params: idParams }), categories.get);
household.patch("/categories/:id", validate({ params: idParams, body: updateCategorySchema }), categories.update);
household.delete("/categories/:id", validate({ params: idParams }), categories.remove);

// Lançamentos
household.get("/transactions", validate({ query: listTransactionsQuery }), transactions.list);
household.post("/transactions", validate({ body: createTransactionSchema }), transactions.create);
household.get("/transactions/:id", validate({ params: idParams }), transactions.get);
household.patch(
  "/transactions/:id",
  validate({ params: idParams, body: updateTransactionSchema }),
  transactions.update
);
household.delete("/transactions/:id", validate({ params: idParams }), transactions.remove);

// Relatórios
household.get("/reports/summary", validate({ query: summaryQuery }), reports.summary);
household.get("/reports/by-category", validate({ query: byCategoryQuery }), reports.byCategory);
household.get("/reports/monthly", validate({ query: monthlyQuery }), reports.monthly);

// Importação de extratos: prévia (o arquivo vai cru no corpo) e gravação
household.post(
  "/imports/preview",
  express.raw({ type: () => true, limit: MAX_IMPORT_FILE }),
  validate({ query: previewQuery }),
  imports.preview
);
household.post("/imports", validate({ body: commitImportSchema }), imports.commit);

// Lançamentos recorrentes (a regra) e a geração dos meses que faltam
household.get("/recurrences", recurrences.list);
household.post("/recurrences", validate({ body: createRecurrenceSchema }), recurrences.create);
household.post("/recurrences/materialize", recurrences.materializeAll);
household.get("/recurrences/:id", validate({ params: idParams }), recurrences.get);
household.patch("/recurrences/:id", validate({ params: idParams, body: updateRecurrenceSchema }), recurrences.update);
household.delete(
  "/recurrences/:id",
  validate({ params: idParams, query: deleteRecurrenceQuery }),
  recurrences.remove
);

// Orçamento por categoria
household.get("/budgets", validate({ query: summaryQuery }), budgets.list);
household.put("/budgets/:categoryId", validate({ params: budgetParams, body: upsertBudgetSchema }), budgets.upsert);
household.delete("/budgets/:categoryId", validate({ params: budgetParams }), budgets.remove);

import { z } from "../lib/zod.js";
import { isoDate, money, uuid } from "./common.schemas.js";
import { transactionType } from "./transactions.schemas.js";

// Filtros da tabela de lançamentos. Listas vão separadas por vírgula na query
// string (?type=expense,income&category=<id>,none), como a tela monta a URL.

export const MAX_BULK = 5000;
export const MAX_EXPORT = 10000;

// "a,b,c" -> ["a", "b", "c"], cada item validado pelo schema
const list = (item) =>
  z
    .string()
    .transform((value) => value.split(",").map((part) => part.trim()).filter(Boolean))
    .pipe(z.array(item).min(1).max(200));

const amount = z.coerce.number().pipe(money.min(0));

export const SORT_COLUMNS = {
  date: "due_date",
  description: "description",
  category: "category_name",
  account: "account_name",
  amount: "amount",
  status: "status",
};

export const searchFilterFields = {
  from: isoDate.optional().meta({ description: "Vencimento a partir desta data (inclusive)" }),
  to: isoDate.optional().meta({ description: "Vencimento até esta data (inclusive)" }),
  q: z.string().trim().min(1).max(100).optional().meta({ description: "Trecho da descrição (sem diferenciar maiúsculas nem acentos)" }),
  type: list(transactionType).optional().meta({ description: "Tipos, separados por vírgula (ex.: expense,income)" }),
  category: list(z.union([uuid, z.literal("none")]))
    .optional()
    .meta({ description: "Ids de categoria separados por vírgula; `none` = sem categoria (transferências)" }),
  account: list(uuid).optional().meta({ description: "Ids de conta separados por vírgula (origem ou destino)" }),
  status: z.enum(["paid", "pending"]).optional().meta({ description: "paid = pago; pending = a pagar ou a receber" }),
  min: amount.optional().meta({ description: "Valor mínimo" }),
  max: amount.optional().meta({ description: "Valor máximo" }),
};

function withFilterRules(schema) {
  return schema
    .refine((q) => !q.from || !q.to || q.from <= q.to, { path: ["to"], message: "A data final precisa ser igual ou depois da inicial" })
    .refine((q) => q.min === undefined || q.max === undefined || q.min <= q.max, {
      path: ["max"],
      message: "O valor máximo precisa ser maior ou igual ao mínimo",
    });
}

const sortFields = {
  sort: z.enum(Object.keys(SORT_COLUMNS)).default("date").meta({ description: "Coluna da ordenação" }),
  order: z.enum(["asc", "desc"]).default("desc").meta({ description: "Crescente ou decrescente" }),
};

// Campos sem as regras entre eles (o que vai para o Swagger)
export const searchQueryFields = z.object({
  ...searchFilterFields,
  ...sortFields,
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export const searchQuery = withFilterRules(searchQueryFields);

export const exportQueryFields = z.object({ ...searchFilterFields, ...sortFields });
export const exportQuery = withFilterRules(exportQueryFields);

// Troca de categoria em lote: os lançamentos escolhidos (ids) ou todos os que
// passam num filtro (filter, com os mesmos campos da busca)
export const recategorizeSchema = z
  .object({
    category_id: uuid,
    ids: z.array(uuid).min(1).max(MAX_BULK).optional(),
    filter: withFilterRules(z.object(searchFilterFields)).optional(),
  })
  .refine((body) => (body.ids === undefined) !== (body.filter === undefined), {
    path: ["ids"],
    message: "Informe os lançamentos (ids) ou um filtro (filter), um dos dois",
  });

// Filtros validados -> parâmetros da função search_transactions do banco
export function searchParams(householdId, filter) {
  const categories = filter.category ?? [];
  const ids = categories.filter((c) => c !== "none");
  return {
    p_household_id: householdId,
    p_from: filter.from ?? null,
    p_to: filter.to ?? null,
    p_query: filter.q ?? null,
    p_types: filter.type ?? null,
    p_category_ids: ids.length > 0 ? ids : null,
    p_uncategorized: categories.includes("none"),
    p_account_ids: filter.account ?? null,
    p_status: filter.status ?? null,
    p_min_amount: filter.min ?? null,
    p_max_amount: filter.max ?? null,
  };
}

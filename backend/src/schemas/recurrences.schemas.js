import { z } from "../lib/zod.js";
import { booleanQuery, money, month, nonEmpty, uuid } from "./common.schemas.js";
import { transactionRuleIssues, transactionType } from "./transactions.schemas.js";

const fields = {
  type: transactionType,
  description: z.string().trim().min(1).max(190).meta({ example: "Aluguel" }),
  amount: money.positive(),
  account_id: uuid,
  destination_account_id: uuid.nullable(),
  category_id: uuid.nullable(),
  day_of_month: z.number().int().min(1).max(31).meta({ description: "Dia do mês; 31 cai no último dia em meses mais curtos", example: 10 }),
  start_month: month.meta({ description: "Primeiro mês (YYYY-MM)", example: "2026-11" }),
  occurrences: z
    .number()
    .int()
    .min(1)
    .max(600)
    .nullable()
    .meta({ description: "Quantas vezes (parcelas). null = sem fim", example: 12 }),
  auto_paid: z.boolean().meta({ description: "Débito automático: entra como pago no dia. false = entra pendente" }),
  is_active: z.boolean().meta({ description: "false = pausada: para de gerar lançamentos" }),
};

function withRules(schema) {
  return schema.superRefine((recurrence, ctx) => {
    for (const issue of transactionRuleIssues(recurrence)) {
      ctx.addIssue({ code: "custom", path: [issue.path], message: issue.message });
    }
  });
}

export const createRecurrenceSchema = withRules(
  z.object({
    type: fields.type,
    description: fields.description,
    amount: fields.amount,
    account_id: fields.account_id,
    destination_account_id: fields.destination_account_id.optional(),
    category_id: fields.category_id.optional(),
    day_of_month: fields.day_of_month,
    start_month: fields.start_month,
    occurrences: fields.occurrences.default(null),
    auto_paid: fields.auto_paid.default(false),
  })
);

// As regras de tipo dependem da combinação (ver o controller, que valida a regra mesclada)
export const updateRecurrenceSchema = nonEmpty(z.object(fields).partial());

export const deleteRecurrenceQuery = z.object({
  remove_pending: booleanQuery
    .default(true)
    .meta({ description: "Exclui também os lançamentos futuros ainda pendentes gerados por ela (padrão: true)" }),
});

// Campos que mudam os lançamentos gerados: ao alterá-los, os pendentes futuros são refeitos
export const GENERATION_FIELDS = [
  "type",
  "description",
  "amount",
  "account_id",
  "destination_account_id",
  "category_id",
  "day_of_month",
  "start_month",
  "occurrences",
  "auto_paid",
];

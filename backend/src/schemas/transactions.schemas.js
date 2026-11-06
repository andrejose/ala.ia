import { z } from "../lib/zod.js";
import { isoDate, money, nonEmpty, pagination, uuid } from "./common.schemas.js";

export const transactionType = z.enum(["income", "expense", "transfer"]);

const fields = {
  type: transactionType,
  description: z.string().trim().min(1).max(200).meta({ example: "Supermercado" }),
  amount: money.positive(),
  account_id: uuid,
  destination_account_id: uuid.nullable(),
  category_id: uuid.nullable(),
  due_date: isoDate,
  payment_date: isoDate.nullable(),
};

// Mesmas regras do check transactions_type_chk do banco, com mensagens claras.
// Usada no POST e no PATCH (sobre o lançamento já mesclado com as alterações).
export function transactionRuleIssues(tx) {
  const issues = [];
  if (tx.type === "transfer") {
    if (!tx.destination_account_id) {
      issues.push({ path: "destination_account_id", message: "Transferência exige a conta de destino" });
    } else if (tx.destination_account_id === tx.account_id) {
      issues.push({ path: "destination_account_id", message: "A conta de destino deve ser diferente da conta de origem" });
    }
    if (tx.category_id) {
      issues.push({ path: "category_id", message: "Transferência não tem categoria" });
    }
  } else {
    if (!tx.category_id) {
      issues.push({ path: "category_id", message: "Receitas e despesas exigem uma categoria" });
    }
    if (tx.destination_account_id) {
      issues.push({ path: "destination_account_id", message: "Só transferências têm conta de destino" });
    }
  }
  return issues;
}

// Campos fora do schema (ex.: user_id, household_id) são descartados:
// o autor é sempre o usuário logado e o household vem da URL.
export const createTransactionSchema = z
  .object({
    type: fields.type,
    description: fields.description,
    amount: fields.amount,
    account_id: fields.account_id,
    destination_account_id: fields.destination_account_id.optional(),
    category_id: fields.category_id.optional(),
    due_date: fields.due_date.optional(),
    payment_date: fields.payment_date.optional(),
  })
  .superRefine((tx, ctx) => {
    for (const issue of transactionRuleIssues(tx)) {
      ctx.addIssue({ code: "custom", path: [issue.path], message: issue.message });
    }
  });

export const updateTransactionSchema = nonEmpty(z.object(fields).partial());

export const listTransactionsQuery = z
  .object({
    type: transactionType.optional(),
    account_id: uuid.optional().meta({ description: "Lançamentos em que a conta é origem ou destino" }),
    category_id: uuid.optional(),
    from: isoDate.optional().meta({ description: "Vencimento a partir desta data (inclusive)" }),
    to: isoDate.optional().meta({ description: "Vencimento até esta data (inclusive)" }),
    status: z.enum(["paid", "pending"]).optional().meta({ description: "paid = com payment_date; pending = sem" }),
    ...pagination,
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { path: ["to"], message: "'to' deve ser igual ou posterior a 'from'" });

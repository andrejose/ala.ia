import { z } from "../lib/zod.js";
import { booleanQuery, money, nonEmpty } from "./common.schemas.js";

export const accountType = z.enum(["checking", "savings", "investment", "cash"]);

const fields = {
  name: z.string().trim().min(1).max(100).meta({ example: "Nubank" }),
  type: accountType,
  // Pode ser negativo (ex.: conta que começa no cheque especial)
  initial_balance: money.min(-9_999_999_999.99),
  is_active: z.boolean(),
};

export const createAccountSchema = z.object({
  name: fields.name,
  type: fields.type.default("checking"),
  initial_balance: fields.initial_balance.default(0),
});

export const updateAccountSchema = nonEmpty(z.object(fields).partial());

export const listAccountsQuery = z.object({
  is_active: booleanQuery.optional(),
});

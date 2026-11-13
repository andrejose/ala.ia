import { z } from "../lib/zod.js";
import { money, uuid } from "./common.schemas.js";

export const budgetParams = z.object({ categoryId: uuid });

export const upsertBudgetSchema = z.object({
  amount: money.positive().meta({ description: "Limite de gasto por mês", example: 800 }),
});

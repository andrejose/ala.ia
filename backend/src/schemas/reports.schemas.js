import { z } from "../lib/zod.js";
import { month } from "./common.schemas.js";
import { categoryType } from "./categories.schemas.js";

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export const summaryQuery = z.object({
  month: month.prefault(currentMonth).meta({ description: "Mês no formato YYYY-MM (padrão: mês atual)" }),
});

export const byCategoryQuery = z.object({
  month: month.prefault(currentMonth).meta({ description: "Mês no formato YYYY-MM (padrão: mês atual)" }),
  type: categoryType.default("expense"),
});

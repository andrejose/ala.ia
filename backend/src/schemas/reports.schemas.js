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

// "YYYY-MM-01" deslocado em n meses
function shiftMonth(firstDay, n) {
  const [year, month] = firstDay.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + n, 1)).toISOString().slice(0, 10);
}

function monthsBetween(from, to) {
  const [fromYear, fromMonth] = from.split("-").map(Number);
  const [toYear, toMonth] = to.split("-").map(Number);
  return (toYear - fromYear) * 12 + (toMonth - fromMonth) + 1;
}

export const MAX_SERIES_MONTHS = 24;

// Campos da query, sem as regras entre eles (é o que vai para o Swagger)
export const monthlyQueryFields = z.object({
  from: month.optional().meta({ description: "Primeiro mês, YYYY-MM (padrão: 5 meses antes de `to`)" }),
  to: month.prefault(currentMonth).meta({ description: "Último mês, YYYY-MM (padrão: mês atual)" }),
});

export const monthlyQuery = monthlyQueryFields
  .transform(({ from, to }) => ({ from: from ?? shiftMonth(to, -5), to }))
  .refine(({ from, to }) => from <= to, { message: "O mês inicial precisa ser antes do final", path: ["from"] })
  .refine(({ from, to }) => monthsBetween(from, to) <= MAX_SERIES_MONTHS, {
    message: `Escolha no máximo ${MAX_SERIES_MONTHS} meses`,
    path: ["from"],
  });

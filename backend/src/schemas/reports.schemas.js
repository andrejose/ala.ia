import { z } from "../lib/zod.js";
import { isoDate, month } from "./common.schemas.js";
import { categoryType } from "./categories.schemas.js";

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

// Mês do orçamento (e do relatório antes do período): YYYY-MM, padrão o atual
export const summaryQuery = z.object({
  month: month.prefault(currentMonth).meta({ description: "Mês no formato YYYY-MM (padrão: mês atual)" }),
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

// Último dia do mês de "YYYY-MM-01"
function lastDay(firstDay) {
  const [year, month] = firstDay.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

export const MAX_SERIES_MONTHS = 24;

// -----------------------------------------------------------------------------
// Resumo e por categoria: um mês (month=YYYY-MM) ou um período (from e to, datas
// YYYY-MM-DD, inclusive). Sem nada, o mês atual. Depois de validado, sempre vem
// { month?, from, to }: month só quando foi pedido um mês.
// -----------------------------------------------------------------------------
const periodFields = {
  month: month.optional().meta({ description: "Mês no formato YYYY-MM (padrão: mês atual). Use este ou `from` e `to`." }),
  from: isoDate.optional().meta({ description: "Início do período, YYYY-MM-DD (inclusive). Use junto com `to`." }),
  to: isoDate.optional().meta({ description: "Fim do período, YYYY-MM-DD (inclusive). Até 24 meses depois de `from`." }),
};

function withPeriodRules(schema) {
  return schema
    .superRefine((query, ctx) => {
      const hasPeriod = query.from !== undefined || query.to !== undefined;
      if (hasPeriod && query.month !== undefined) {
        ctx.addIssue({ code: "custom", path: ["month"], message: "Use o mês ou o período (from e to), não os dois" });
      }
      if (hasPeriod && (query.from === undefined || query.to === undefined)) {
        ctx.addIssue({ code: "custom", path: [query.from === undefined ? "from" : "to"], message: "Informe a data inicial e a final" });
      }
      if (query.from && query.to) {
        if (query.from > query.to) {
          ctx.addIssue({ code: "custom", path: ["from"], message: "A data inicial precisa ser antes da final" });
        } else if (monthsBetween(query.from, query.to) > MAX_SERIES_MONTHS) {
          ctx.addIssue({ code: "custom", path: ["from"], message: `Escolha um período de no máximo ${MAX_SERIES_MONTHS} meses` });
        }
      }
    })
    .transform(({ month: chosen, from, to, ...rest }) => {
      if (from && to) return { from, to, ...rest };
      const first = chosen ?? `${currentMonth()}-01`;
      return { month: first, from: first, to: lastDay(first), ...rest };
    });
}

export const reportSummaryFields = z.object(periodFields);
export const reportSummaryQuery = withPeriodRules(reportSummaryFields);

export const byCategoryFields = z.object({ ...periodFields, type: categoryType.default("expense") });
export const byCategoryQuery = withPeriodRules(byCategoryFields);

// -----------------------------------------------------------------------------
// Mês a mês: de um mês a outro (YYYY-MM) ou, num período (YYYY-MM-DD), os meses
// que ele cobre, com o primeiro e o último cortados nas datas.
// -----------------------------------------------------------------------------
const monthOrDate = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/, "Use YYYY-MM (mês) ou YYYY-MM-DD (data)");

// Campos da query, sem as regras entre eles (é o que vai para o Swagger)
export const monthlyQueryFields = z.object({
  from: monthOrDate
    .optional()
    .meta({ description: "Primeiro mês, YYYY-MM (padrão: 5 meses antes de `to`), ou a data inicial do período, YYYY-MM-DD" }),
  to: monthOrDate
    .prefault(currentMonth)
    .meta({ description: "Último mês, YYYY-MM (padrão: mês atual), ou a data final do período, YYYY-MM-DD" }),
});

export const monthlyQuery = monthlyQueryFields
  .superRefine(({ from, to }, ctx) => {
    if (from && from.length !== to.length) {
      ctx.addIssue({ code: "custom", path: ["from"], message: "Use o mesmo formato em `from` e `to` (os dois meses ou as duas datas)" });
    }
    if (!from && to.length === 10) {
      ctx.addIssue({ code: "custom", path: ["from"], message: "Informe a data inicial do período" });
    }
  })
  .transform(({ from, to }) => {
    if (to.length === 10) return { period: true, from, to };
    const last = `${to}-01`;
    return { period: false, from: from ? `${from}-01` : shiftMonth(last, -5), to: last };
  })
  .refine(({ from, to }) => from <= to, { message: "O início precisa ser antes do fim", path: ["from"] })
  .refine(({ from, to }) => monthsBetween(from, to) <= MAX_SERIES_MONTHS, {
    message: `Escolha no máximo ${MAX_SERIES_MONTHS} meses`,
    path: ["from"],
  });

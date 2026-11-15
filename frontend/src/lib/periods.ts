import { addDays, addMonthsToDate } from "./format";
import { today } from "./money";

export interface Period {
  from: string;
  to: string;
}

// Atalhos de período usados nos relatórios e na tabela de lançamentos
export function periodPresets(): Array<{ label: string; period: Period }> {
  const day = today();
  const year = Number(day.slice(0, 4));
  return [
    { label: "Últimos 30 dias", period: { from: addDays(day, -29), to: day } },
    { label: "Últimos 3 meses", period: { from: addDays(addMonthsToDate(day, -3), 1), to: day } },
    { label: "Este ano", period: { from: `${year}-01-01`, to: `${year}-12-31` } },
    { label: "Ano passado", period: { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` } },
  ];
}

// Primeiro e último dia de um mês "YYYY-MM"
export function monthPeriod(month: string): Period {
  const [year, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

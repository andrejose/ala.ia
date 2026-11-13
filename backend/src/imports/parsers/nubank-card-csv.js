import { csvRows, normalize, parseBrlAmount, parseDate, ParseError } from "../text.js";

// Regras da fatura do Nubank usadas pelo CSV e pelo PDF.
// Na fatura, valor positivo é compra (sai do cartão) e negativo é pagamento ou
// estorno. Por isso o sinal é invertido para o ponto de vista da conta.
// O pagamento ("Pagamento recebido" no CSV, "Pagamento em 13 OUT" no PDF) vem
// desmarcado: ele é lançado como transferência da conta que pagou.
export function nubankEntry(title, charge) {
  return {
    description: title,
    amount: -charge,
    ...(normalize(title).startsWith("pagamento") && {
      deselect: "Pagamento da fatura: lance como transferência da conta que pagou, para não contar duas vezes.",
    }),
  };
}

// Nubank — fatura do cartão em CSV: date,title,amount
export const nubankCardCsv = {
  id: "nubank-card-csv",
  label: "Fatura do cartão Nubank (CSV)",
  format: "text",
  kind: "credit_card",

  detect({ text }) {
    return normalize(text.split("\n", 1)[0]).replace(/\s/g, "") === "date,title,amount";
  },

  parse({ text }) {
    const [, ...rows] = csvRows(text, ",");
    const result = [];
    rows.forEach((cells, index) => {
      const line = index + 2;
      const [rawDate, title = "", rawAmount] = cells;
      const date = parseDate(rawDate);
      const charge = parseBrlAmount(rawAmount);
      if (!date || charge === null) throw new ParseError("Linha da fatura do Nubank em formato inesperado", line);
      if (charge === 0) return;

      result.push({ line, date, ...nubankEntry(title, charge) });
    });
    return result;
  },
};

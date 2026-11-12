import { csvRows, normalize, parseBrlAmount, parseDate, ParseError } from "../text.js";

// Nubank — fatura do cartão em CSV: date,title,amount
// Na fatura, valor positivo é compra (sai do cartão) e negativo é pagamento ou
// estorno. Por isso o sinal é invertido para o ponto de vista da conta.
export const nubankCardCsv = {
  id: "nubank-card-csv",
  label: "Fatura do cartão Nubank (CSV)",
  kind: "credit_card",

  detect(text) {
    return normalize(text.split("\n", 1)[0]).replace(/\s/g, "") === "date,title,amount";
  },

  parse(text) {
    const [, ...rows] = csvRows(text, ",");
    const result = [];
    rows.forEach((cells, index) => {
      const line = index + 2;
      const [rawDate, title = "", rawAmount] = cells;
      const date = parseDate(rawDate);
      const charge = parseBrlAmount(rawAmount);
      if (!date || charge === null) throw new ParseError("Linha da fatura do Nubank em formato inesperado", line);
      if (charge === 0) return;

      result.push({
        line,
        date,
        description: title,
        amount: -charge,
        ...(normalize(title).startsWith("pagamento recebido") && {
          deselect: "Pagamento da fatura: lance como transferência da conta que pagou, para não contar duas vezes.",
        }),
      });
    });
    return result;
  },
};

import { normalize, parseBrlAmount, ParseError } from "../text.js";
import { nubankEntry } from "./nubank-card-csv.js";

// Nubank — fatura do cartão em PDF (páginas "TRANSAÇÕES"):
//   06 OUT   •••• 3357   Dio - Parcela 12/12          R$ 24,90
//   13 OUT               Pagamento em 13 OUT          −R$ 3.339,70
// A data não tem ano: vem da fatura ("FATURA 13 NOV 2026"). Compra de um mês
// depois do da fatura é do ano anterior (fatura de janeiro, compra de dezembro).
// As linhas de conversão de moeda ("USD 20.00") e os totais não entram.

const MONTHS = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
const DAY_MONTH = new RegExp(`^(\\d{2}) (${MONTHS.join("|")})$`);
const MONEY = /^[−-]?R\$\s?[\d.]+,\d{2}$/;
const CARD = /^•+\s*\d{4}$/;
const INVOICE = new RegExp(`FATURA (\\d{2}) (${MONTHS.join("|")}) (\\d{4})`);

export const nubankCardPdf = {
  id: "nubank-card-pdf",
  label: "Fatura do cartão Nubank (PDF)",
  format: "pdf",
  kind: "credit_card",

  detect({ lines }) {
    const text = lines.map((l) => l.text).join("\n");
    return INVOICE.test(text) && normalize(text).includes("transacoes") && normalize(text).includes("nu pagamentos");
  },

  parse({ lines }) {
    const invoice = INVOICE.exec(lines.map((l) => l.text).join("\n"));
    const invoiceMonth = MONTHS.indexOf(invoice[2]) + 1;
    const invoiceYear = Number(invoice[3]);

    const result = [];
    lines.forEach((line, index) => {
      const dayMonth = DAY_MONTH.exec(line.cells[0].text);
      const last = line.cells.at(-1);
      if (!dayMonth || !MONEY.test(last.text)) return;

      const month = MONTHS.indexOf(dayMonth[2]) + 1;
      const year = month > invoiceMonth ? invoiceYear - 1 : invoiceYear;
      const date = `${year}-${String(month).padStart(2, "0")}-${dayMonth[1]}`;
      const title = line.cells
        .slice(1, -1)
        .filter((c) => !CARD.test(c.text))
        .map((c) => c.text)
        .join(" ");
      const charge = parseBrlAmount(last.text.replace("−", "-"));
      if (!title || charge === null) throw new ParseError("Linha da fatura do Nubank em formato inesperado", index + 1);
      if (charge === 0) return;

      result.push({ line: index + 1, date, ...nubankEntry(title, charge) });
    });
    return result;
  },
};

import { normalize, parseBrlAmount, parseDate, ParseError } from "../text.js";

// Banco do Brasil — extrato da poupança em PDF ("Extrato de Poupança"), o
// comprovante que o app do BB gera por mês. Depois de "Lançamentos", cada
// lançamento ocupa duas linhas:
//   14/04/2026                                   R$ 5,13
//   Reajuste Monetário - Bacen
// Saques vêm com "-R$". A tabela termina em "Saldos por data-base".
//
// Juros e reajuste são o rendimento da poupança (receita). As transferências
// ("Transferência de Crédito", "Transferencia Para Conta") só movem dinheiro
// entre a poupança e outra conta: vêm desmarcadas, para serem lançadas como
// transferência entre as contas.

const DATE = /^\d{2}\/\d{2}\/\d{4}$/;
const MONEY = /^-?R\$\s?[\d.]+,\d{2}$/;

export const bbSavingsPdf = {
  id: "bb-savings-pdf",
  label: "Poupança do Banco do Brasil (PDF)",
  format: "pdf",
  kind: "checking",

  detect({ text }) {
    const t = normalize(text);
    return t.includes("extrato de poupanca") && t.includes("lancamentos");
  },

  parse({ lines }) {
    const start = lines.findIndex((l) => normalize(l.text) === "lancamentos");
    const end = lines.findIndex((l) => normalize(l.text).startsWith("saldos por data-base"));
    const table = lines.slice(start + 1, end === -1 ? undefined : end);

    const result = [];
    table.forEach((line, index) => {
      const first = line.cells[0];
      const last = line.cells.at(-1);
      if (!DATE.test(first.text)) return;

      const next = table[index + 1];
      const description = next && next.page === line.page && !DATE.test(next.cells[0].text) ? next.text.trim() : "";
      const date = parseDate(first.text);
      const amount = MONEY.test(last.text) ? parseBrlAmount(last.text) : null;
      if (!date || amount === null || !description) {
        throw new ParseError("Lançamento do extrato da poupança em formato inesperado", start + index + 2);
      }
      if (amount === 0) return;

      result.push({
        line: start + index + 2,
        date,
        description,
        amount,
        ...(normalize(description).startsWith("transferencia") && {
          deselect: "Transferência entre a poupança e outra conta: lance como transferência entre as contas, para não contar como receita ou despesa.",
        }),
      });
    });
    return result;
  },
};

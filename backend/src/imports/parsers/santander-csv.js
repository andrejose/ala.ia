import { csvRows, normalize, parseBrlAmount, parseDate, ParseError } from "../text.js";

// Santander — extrato da conta corrente em CSV (UTF-8, separado por ponto e vírgula).
// Começa com dados do cliente e, depois de "Lançamentos:", vem a tabela:
// Data;Descrição;Detalhe;Valor;Saldo   (valores como "-R$ 2.800,00")
const HEADER = "data;descricao;detalhe;valor;saldo";

export const santanderCsv = {
  id: "santander-csv",
  label: "Santander (CSV)",
  kind: "checking",

  detect(text) {
    return text.split("\n").some((line) => normalize(line).startsWith(HEADER));
  },

  parse(text) {
    const lines = text.split("\n");
    const start = lines.findIndex((line) => normalize(line).startsWith(HEADER));
    const result = [];
    csvRows(lines.slice(start + 1).join("\n"), ";").forEach((cells, index) => {
      const line = start + index + 2;
      const [rawDate, entry = "", detail = "", rawAmount] = cells;
      const date = parseDate(rawDate);
      const amount = parseBrlAmount(rawAmount);
      if (!date || amount === null) throw new ParseError("Linha do extrato do Santander em formato inesperado", line);
      if (amount === 0) return;

      result.push({ line, date, description: detail ? `${entry} · ${detail}` : entry, amount });
    });
    return result;
  },
};

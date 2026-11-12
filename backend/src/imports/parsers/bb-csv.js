import { csvRows, normalize, parseBrlAmount, parseDate, ParseError } from "../text.js";

// Banco do Brasil — extrato da conta corrente em CSV (Latin-1, separado por vírgula):
// "Data","Lançamento","Detalhes","N° documento","Valor","Tipo Lançamento"
// As linhas de saldo ("Saldo Anterior", "Saldo do dia", "S A L D O") não são lançamentos.
const SALDO = new Set(["saldo anterior", "saldo do dia", "s a l d o", "saldo"]);

export const bbCsv = {
  id: "bb-csv",
  label: "Banco do Brasil (CSV)",
  kind: "checking",

  detect(text) {
    const header = normalize(text.split("\n", 1)[0]);
    return header.includes("lancamento") && header.includes("detalhes") && header.includes("tipo lancamento");
  },

  parse(text) {
    const [, ...rows] = csvRows(text, ",");
    const result = [];
    rows.forEach((cells, index) => {
      const line = index + 2;
      const [rawDate, entry = "", details = "", , rawAmount] = cells;
      if (SALDO.has(normalize(entry))) return;

      const date = parseDate(rawDate);
      const amount = parseBrlAmount(rawAmount);
      if (!date || amount === null) throw new ParseError("Linha do extrato do BB em formato inesperado", line);
      if (amount === 0) return;

      // "31/10 11:08 GRUBER COMERCIO" -> "GRUBER COMERCIO" (a data da compra já vem na linha)
      const detail = details.replace(/^\d{2}\/\d{2}\s+\d{2}:\d{2}\s+/, "").trim();
      const description =
        normalize(entry) === "compra com cartao" && detail ? detail : detail ? `${entry} · ${detail}` : entry;

      result.push({
        line,
        date,
        description,
        amount,
        ...(normalize(entry) === "bb rende facil" && {
          deselect: "Aplicação ou resgate automático (BB Rende Fácil): o dinheiro não saiu de fato.",
        }),
      });
    });
    return result;
  },
};

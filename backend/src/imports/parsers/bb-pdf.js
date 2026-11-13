import { normalize, parseBrlAmount, parseDate, ParseError } from "../text.js";
import { bbEntry } from "./bb-csv.js";

// Banco do Brasil — extrato da conta corrente em PDF.
// Cada lançamento ocupa até três linhas, bem próximas:
//   Compra com Cartão                                  <- histórico (logo acima)
//   03/11/2026  99008  140111            39,99 (-)     <- data, lote, documento, valor
//   31/10 11:08 GRUBER COMERCIO DE B                   <- detalhe (logo abaixo)
// Quando o detalhe é longo, ele sobe para a linha da data e continua embaixo:
//   Pix - Agendamento
//   09/11/2026  13105  110901  08/11 05:30 ESCOLA VILA LUZ   1.399,76 (-)
//   MONTESSOR
// Lançamentos sem detalhe trazem o histórico na própria linha da data.
// Depois da tabela vêm "Informações Adicionais" e "Lançamentos Futuros", que
// não entram.

const DATE = /^\d{2}\/\d{2}\/\d{4}$/;
const VALUE = /^([\d.]+,\d{2})\s*\(([+-])\)$/;
const HISTORY_X = 250; // coluna "Histórico": tudo o que começa à direita disso
const NEAR = 13; // histórico e detalhe ficam a até isso da linha da data
const END = ["informacoes adicionais", "lancamentos futuros", "informacoes complementares"];

const historyText = (line) =>
  line.cells
    .filter((c) => c.x >= HISTORY_X && !VALUE.test(c.text))
    .map((c) => c.text)
    .join(" ");
const isOnlyHistory = (line) => line.cells.every((c) => c.x >= HISTORY_X) && !line.cells.some((c) => VALUE.test(c.text));

const isMain = (line) => line && DATE.test(line.cells[0].text) && line.cells[0].x < HISTORY_X;

// A linha k é o detalhe (logo abaixo) do lançamento da linha anterior
function isDetail(lines, k) {
  const main = lines[k - 1];
  return isMain(main) && main.page === lines[k].page && main.y - lines[k].y <= NEAR;
}

export const bbPdf = {
  id: "bb-pdf",
  label: "Banco do Brasil (PDF)",
  format: "pdf",
  kind: "checking",

  detect({ lines }) {
    const text = normalize(lines.slice(0, 15).map((l) => l.text).join("\n"));
    return text.includes("extrato de conta corrente") && /dia lote documento historico valor/.test(text);
  },

  parse({ lines }) {
    const result = [];
    let ended = false;
    lines.forEach((line, index) => {
      if (ended) return;
      if (END.some((end) => normalize(line.text).startsWith(end))) {
        ended = true;
        return;
      }
      const first = line.cells[0];
      const last = line.cells.at(-1);
      if (!DATE.test(first.text) || first.x > HISTORY_X) return;
      const value = VALUE.exec(last.text);
      if (!value) throw new ParseError("Linha do extrato do BB em formato inesperado", index + 1);

      const sameLine = historyText(line);
      const above = lines[index - 1];
      const below = lines[index + 1];
      // A linha de cima é o histórico deste lançamento, e não o detalhe do anterior
      const hasTitle =
        above && above.page === line.page && above.y - line.y <= NEAR && isOnlyHistory(above) && !isDetail(lines, index - 1);
      const hasDetailBelow = below && below.page === line.page && line.y - below.y <= NEAR && isOnlyHistory(below);

      const entry = hasTitle ? historyText(above) : sameLine;
      const details = hasTitle ? [sameLine, hasDetailBelow ? historyText(below) : ""].filter(Boolean).join(" ") : "";
      const parsed = bbEntry(entry, details);
      if (!parsed) return;

      const date = parseDate(first.text);
      const amount = parseBrlAmount(`${value[2]}${value[1]}`);
      if (!date || amount === null || !entry) throw new ParseError("Linha do extrato do BB em formato inesperado", index + 1);
      if (amount === 0) return;

      result.push({ line: index + 1, date, amount, ...parsed });
    });
    return result;
  },
};

import { normalize, parseBrlAmount, parseDate, ParseError } from "../text.js";

// Santander — extrato da conta corrente em PDF ("DETALHE DOS MOVIMENTOS").
// Os lançamentos vêm em uma linha (data, descrição, valor, saldo) ou em três:
//   Pix enviado                                   <- descrição (logo acima)
//   03/11/2026                 -R$ 900,00  R$ 2.894,61
//   Crematorio Uniao Amp                          <- detalhe (logo abaixo)
// Os títulos de dia ("Terça, 3 de novembro de 2026") ficam à esquerda da
// coluna de descrição e não entram. No PDF o detalhe vem encurtado: por isso a
// descrição pode diferir da do CSV, e a prévia marca como parecido o que já
// entrou pelo outro formato (mesma data e valor).

const DATE = /^\d{2}\/\d{2}\/\d{4}$/;
const MONEY = /^-?R\$\s?[\d.]+,\d{2}$/;
const DESCRIPTION_X = 100;
const NEAR = 12;

const descriptionText = (line) =>
  line.cells
    .filter((c) => c.x >= DESCRIPTION_X && !MONEY.test(c.text))
    .map((c) => c.text)
    .join(" ");
const isOnlyDescription = (line) =>
  line.cells.every((c) => c.x >= DESCRIPTION_X) && !line.cells.some((c) => MONEY.test(c.text) || DATE.test(c.text));

export const santanderPdf = {
  id: "santander-pdf",
  label: "Santander (PDF)",
  format: "pdf",
  kind: "checking",

  detect({ lines }) {
    const text = normalize(lines.map((l) => l.text).join("\n"));
    return text.includes("extrato de conta") && text.includes("detalhe dos movimentos") && !text.includes("lote documento");
  },

  parse({ lines }) {
    const result = [];
    lines.forEach((line, index) => {
      const first = line.cells[0];
      if (!DATE.test(first.text) || first.x >= DESCRIPTION_X) return;
      const money = line.cells.filter((c) => MONEY.test(c.text));
      if (money.length === 0) throw new ParseError("Linha do extrato do Santander em formato inesperado", index + 1);

      const sameLine = descriptionText(line);
      const above = lines[index - 1];
      const below = lines[index + 1];
      const nearAbove = above && above.page === line.page && above.y - line.y <= NEAR && isOnlyDescription(above);
      const nearBelow = below && below.page === line.page && line.y - below.y <= NEAR && isOnlyDescription(below);

      const entry = sameLine || (nearAbove ? descriptionText(above) : "");
      const detail = !sameLine && nearBelow ? descriptionText(below) : "";
      const date = parseDate(first.text);
      const amount = parseBrlAmount(money[0].text); // o primeiro é o valor; o segundo, o saldo
      if (!date || amount === null || !entry) throw new ParseError("Linha do extrato do Santander em formato inesperado", index + 1);
      if (amount === 0) return;

      result.push({ line: index + 1, date, description: detail ? `${entry} · ${detail}` : entry, amount });
    });
    return result;
  },
};

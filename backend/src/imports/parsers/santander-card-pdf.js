import { normalize, parseBrlAmount, ParseError } from "../text.js";

// Santander — fatura do cartão em PDF ("Detalhamento da Fatura").
// Os lançamentos vêm em duas colunas lado a lado, que se leem como texto de
// jornal: a coluna da esquerda inteira e depois a da direita. Em cada coluna:
//   Data   Descrição                   Parcela   R$        US$
//   02/10  VELOBR BIKE AND RUN                   61,16
//   23/09  PETSUPERMARK*OR1063950      02/03     341,58
//   08/10  DEB AUTOM DE FATURA EM C/             -9.343,42
// Há seções (Pagamento e Demais Créditos, Despesas, Parcelamentos) e um bloco
// por cartão (titular e adicionais); tudo entra, menos as linhas de total.
//
// As datas não têm ano. A fatura diz até quando vão as compras ("realizados
// até 30/10") e o vencimento ("08/11/2026"); compra de um mês depois do
// fechamento é do ano anterior.
//
// Parcela 2 em diante é a cobrança deste mês de uma compra antiga: a data da
// compra (23/09) cairia num mês que já passou. Por isso ela entra na data do
// fechamento da fatura, com a parcela na descrição ("PETSUPERMARK - Parcela 02/03").

const DAY_MONTH = /^(\d{2})\/(\d{2})$/;
const DATE_START = /^(\d{2})\/(\d{2})(?:\s+(.+))?$/;
const VALUE = /^-?[\d.]+,\d{2}$/;
const MARKER = /^\d$/; // ícones da fatura viram um dígito solto antes da data
const RIGHT_COLUMN_X = 290;

function columns(line) {
  const cells = line.cells.filter((c) => !MARKER.test(c.text));
  return [cells.filter((c) => c.x < RIGHT_COLUMN_X), cells.filter((c) => c.x >= RIGHT_COLUMN_X)];
}

// Fechamento ("realizados até 30/10") e ano, a partir do vencimento ("08/11/2026")
function closingDate(text) {
  const closing = /realizados at[ée] (\d{2})\/(\d{2})/i.exec(text);
  const due = /\b\d{2}\/(\d{2})\/(\d{4})\b/.exec(text);
  if (!closing || !due) return null;
  const month = Number(closing[2]);
  const year = Number(due[1]) < month ? Number(due[2]) - 1 : Number(due[2]);
  return { day: Number(closing[1]), month, year };
}

const iso = (year, month, day) => `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

export const santanderCardPdf = {
  id: "santander-card-pdf",
  label: "Fatura do cartão Santander (PDF)",
  format: "pdf",
  kind: "credit_card",

  detect({ text }) {
    const t = normalize(text);
    return t.includes("santander") && t.includes("detalhamento da fatura") && t.includes("resumo da fatura");
  },

  parse({ lines, text }) {
    const closing = closingDate(text);
    if (!closing) throw new ParseError("Não achei o fechamento e o vencimento da fatura do Santander");

    // Só a parte de detalhamento: o resumo da primeira página também tem datas
    const start = lines.findIndex((l) => normalize(l.text).includes("detalhamento da fatura"));
    const detail = lines.slice(start + 1);

    // Coluna da esquerda de cada página, depois a da direita
    const ordered = [];
    for (const page of [...new Set(detail.map((l) => l.page))]) {
      const pageLines = detail.filter((l) => l.page === page);
      for (const side of [0, 1]) {
        for (const line of pageLines) ordered.push(columns(line)[side]);
      }
    }

    const result = [];
    ordered.forEach((cells, index) => {
      // A data costuma vir no mesmo texto da descrição ("08/10 DEB AUTOM ...")
      const date = DATE_START.exec(cells[0]?.text ?? "");
      const value = cells.at(-1);
      if (!date || cells.length < 2 || !VALUE.test(value?.text ?? "")) return;

      // Depois da data: descrição, parcela (outra dd/mm) e o valor em R$.
      // Na linha também pode vir o US$ (0,00), sempre depois do R$.
      const rest = cells.slice(1);
      const values = rest.filter((c) => VALUE.test(c.text));
      const brl = values.length > 1 ? values.at(-2) : values[0];
      const installment = rest.find((c) => DAY_MONTH.test(c.text));
      const description = [date[3] ?? "", ...rest.filter((c) => c !== installment && !VALUE.test(c.text)).map((c) => c.text)]
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      const charge = parseBrlAmount(brl.text);
      if (!description || charge === null) {
        throw new ParseError("Linha da fatura do Santander em formato inesperado", index + 1);
      }
      if (charge === 0) return;

      const day = Number(date[1]);
      const month = Number(date[2]);
      const [number] = installment ? installment.text.split("/").map(Number) : [1];
      const purchaseYear = month > closing.month ? closing.year - 1 : closing.year;
      const when = number > 1 ? iso(closing.year, closing.month, closing.day) : iso(purchaseYear, month, day);
      const isPayment = charge < 0 && /^(deb autom de fatura|pagamento)/.test(normalize(description));

      result.push({
        line: index + 1,
        date: when,
        description: installment ? `${description} - Parcela ${installment.text}` : description,
        amount: -charge,
        ...(isPayment && {
          deselect: "Pagamento da fatura: lance como transferência da conta que pagou, para não contar duas vezes.",
        }),
      });
    });
    return result;
  },
};

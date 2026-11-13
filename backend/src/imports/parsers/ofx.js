import { createHash } from "node:crypto";
import { normalize, ParseError } from "../text.js";

// OFX — formato padrão de extrato que vários bancos exportam (BB, Santander,
// Itaú...). Pode vir no estilo SGML (tags sem fechamento) ou XML. Cada
// lançamento é um <STMTTRN>:
//   <STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261103120000[-3:BRT]<TRNAMT>-39.99
//   <FITID>202611031<MEMO>Compra com Cartão GRUBER</STMTTRN>
// O valor já vem com o sinal do ponto de vista da conta (débito negativo),
// tanto no extrato quanto na fatura do cartão. O FITID é o identificador do
// banco para a linha: é ele que evita duplicar na reimportação.

const field = (block, tag) => {
  const match = new RegExp(`<${tag}>([^<\\r\\n]*)`, "i").exec(block);
  return match ? match[1].trim() : "";
};

function parseOfx({ text }, { card = false } = {}) {
  const blocks = text.split(/<STMTTRN>/i).slice(1).map((block) => block.split(/<\/STMTTRN>/i)[0]);
  const result = [];
  blocks.forEach((block, index) => {
    const line = index + 1;
    const posted = /^(\d{4})(\d{2})(\d{2})/.exec(field(block, "DTPOSTED"));
    const amount = Number(field(block, "TRNAMT").replace(",", "."));
    const description = (field(block, "MEMO") || field(block, "NAME")).replace(/\s+/g, " ");
    if (!posted || !Number.isFinite(amount) || !description) {
      throw new ParseError("Lançamento do OFX em formato inesperado", line);
    }
    if (amount === 0) return;

    const fitid = field(block, "FITID");
    result.push({
      line,
      date: `${posted[1]}-${posted[2]}-${posted[3]}`,
      description,
      amount: Math.round(amount * 100) / 100,
      ...(fitid && { import_hash: createHash("sha256").update(`ofx|${fitid}`).digest("hex") }),
      // Na fatura do cartão, o pagamento é lançado como transferência da conta que pagou
      ...(card && amount > 0 && normalize(description).startsWith("pagamento") && {
        deselect: "Pagamento da fatura: lance como transferência da conta que pagou, para não contar duas vezes.",
      }),
    });
  });
  return result;
}

const isOfx = (text) => /<OFX>/i.test(text) || /^\s*OFXHEADER:/i.test(text);

export const ofxBank = {
  id: "ofx-bank",
  label: "Extrato de conta em OFX (qualquer banco)",
  format: "text",
  kind: "checking",
  detect: ({ text }) => isOfx(text) && !/<CCSTMTRS>/i.test(text),
  parse: parseOfx,
};

export const ofxCard = {
  id: "ofx-card",
  label: "Fatura de cartão em OFX (qualquer banco)",
  format: "text",
  kind: "credit_card",
  detect: ({ text }) => isOfx(text) && /<CCSTMTRS>/i.test(text),
  parse: (document) => parseOfx(document, { card: true }),
};

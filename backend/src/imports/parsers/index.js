import { bbCsv } from "./bb-csv.js";
import { bbPdf } from "./bb-pdf.js";
import { nubankCardCsv } from "./nubank-card-csv.js";
import { nubankCardPdf } from "./nubank-card-pdf.js";
import { ofxBank, ofxCard } from "./ofx.js";
import { santanderCsv } from "./santander-csv.js";
import { santanderCardPdf } from "./santander-card-pdf.js";
import { santanderPdf } from "./santander-pdf.js";

// Um leitor por banco e formato, todos devolvendo o mesmo formato:
//   { line, date: "YYYY-MM-DD", description, amount, deselect?, import_hash? }
// amount tem sinal do ponto de vista da conta: positivo entra, negativo sai.
// deselect: motivo para a linha vir desmarcada na prévia.
// import_hash: identificador dado pelo banco (OFX); sem ele, vem da própria linha.
//
// format "text": recebe { text } (CSV, OFX). format "pdf": recebe { text, lines },
// com as linhas do PDF e a posição de cada célula (ver ../pdf.js).
// Banco novo = um arquivo novo aqui e um item nesta lista.
export const parsers = [bbCsv, santanderCsv, nubankCardCsv, ofxBank, ofxCard, bbPdf, santanderPdf, santanderCardPdf, nubankCardPdf];

export function detectParser(document) {
  return parsers.find((parser) => parser.format === document.format && parser.detect(document)) ?? null;
}

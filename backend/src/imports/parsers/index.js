import { bbCsv } from "./bb-csv.js";
import { nubankCardCsv } from "./nubank-card-csv.js";
import { santanderCsv } from "./santander-csv.js";

// Um leitor por banco e formato, todos devolvendo o mesmo formato:
//   { line, date: "YYYY-MM-DD", description, amount, deselect? }
// amount tem sinal do ponto de vista da conta: positivo entra, negativo sai.
// deselect: motivo para a linha vir desmarcada na prévia.
// Banco novo = um arquivo novo aqui e um item nesta lista.
export const parsers = [bbCsv, santanderCsv, nubankCardCsv];

export function detectParser(text) {
  return parsers.find((parser) => parser.detect(text)) ?? null;
}

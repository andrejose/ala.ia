import { createHash } from "node:crypto";
import { normalize } from "./text.js";

// Identificador estável da linha: o mesmo extrato exportado de novo gera os
// mesmos hashes. Linhas idênticas no mesmo arquivo (duas compras iguais no
// mesmo dia) se diferenciam pela ordem em que aparecem.
export function withImportHashes(rows) {
  const seen = new Map();
  return rows.map((row) => {
    const key = `${row.date}|${row.amount.toFixed(2)}|${normalize(row.description)}`;
    const occurrence = (seen.get(key) ?? 0) + 1;
    seen.set(key, occurrence);
    return { ...row, import_hash: createHash("sha256").update(`${key}|${occurrence}`).digest("hex") };
  });
}

// Palavras que não ajudam a reconhecer o estabelecimento
const NOISE = new Set([
  "pix", "enviado", "recebido", "agendamento", "compra", "com", "cartao", "pagto", "pagamento",
  "de", "da", "do", "das", "dos", "e", "ltda", "me", "sa", "s", "a", "pg", "ec", "mp", "ifd", "parcela",
]);

// "Pix - Enviado · PIZZARIA NAPOLITANA LTDA" -> "pizzaria napolitana"
export function descriptionKey(description) {
  const words = normalize(description)
    .replace(/[^a-z ]+/g, " ")
    .split(" ")
    .filter((word) => word.length > 1 && !NOISE.has(word));
  return words.slice(0, 2).join(" ");
}

// Categoria sugerida a partir do que a pessoa já lançou: a categoria mais
// recente usada numa descrição parecida, do mesmo tipo. Assim as escolhas da
// prévia viram as sugestões da próxima importação.
export function categorySuggester(history) {
  const byKey = new Map();
  for (const tx of history) {
    const key = descriptionKey(tx.description);
    const mapKey = `${tx.type}:${key}`;
    if (key && tx.category_id && !byKey.has(mapKey)) byKey.set(mapKey, tx.category_id);
  }
  return (type, description) => byKey.get(`${type}:${descriptionKey(description)}`) ?? null;
}

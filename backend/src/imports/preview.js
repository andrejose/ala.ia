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

// IOF cobrado sobre uma compra no exterior: 'IOF de "Anthropic* Claude Sub"'
// -> 'Anthropic* Claude Sub' (a compra a que ele se refere); senão, null
export function iofPurchase(description) {
  const match = /^\s*iof\s+(?:de\s+)?"?(.+?)"?\s*$/i.exec(String(description ?? ""));
  return match ? match[1] : null;
}

// Categoria sugerida a partir do que a pessoa já lançou: a categoria mais
// recente usada numa descrição parecida, do mesmo tipo. Assim as escolhas da
// prévia viram as sugestões da próxima importação.
// O IOF segue a categoria da compra a que se refere e não ensina nada: assim
// uma categoria dada a ele não muda a sugestão da própria compra.
export function categorySuggester(history) {
  const byKey = new Map();
  for (const tx of history) {
    if (iofPurchase(tx.description)) continue;
    const key = descriptionKey(tx.description);
    const mapKey = `${tx.type}:${key}`;
    if (key && tx.category_id && !byKey.has(mapKey)) byKey.set(mapKey, tx.category_id);
  }
  return (type, description) =>
    byKey.get(`${type}:${descriptionKey(iofPurchase(description) ?? description)}`) ?? null;
}

// No mesmo arquivo, liga cada IOF à compra a que ele se refere (a mais próxima
// na data), para a prévia levar a categoria da compra para o IOF.
export function linkIofToPurchases(rows) {
  return rows.map((row) => {
    const purchase = iofPurchase(row.description);
    if (!purchase || row.amount >= 0) return row;
    const key = descriptionKey(purchase);
    const candidates = rows.filter(
      (other) => other !== row && other.amount < 0 && !iofPurchase(other.description) && descriptionKey(other.description) === key
    );
    if (candidates.length === 0) return row;
    const distance = (other) => Math.abs(Date.parse(other.date) - Date.parse(row.date));
    const closest = candidates.reduce((best, other) => (distance(other) < distance(best) ? other : best));
    return { ...row, follows: closest.import_hash };
  });
}

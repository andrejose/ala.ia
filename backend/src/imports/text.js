// Utilitários dos leitores de extrato: texto, CSV, valores e datas.

// Os bancos exportam em codificações diferentes (o BB usa Latin-1, o Santander
// UTF-8 com BOM). Tenta UTF-8 estrito e, se não for, lê como Windows-1252.
export function decodeText(buffer) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    text = new TextDecoder("windows-1252").decode(buffer);
  }
  return text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
}

// Uma linha de CSV com aspas ("a ""b""", c) -> ['a "b"', 'c']
export function splitCsvLine(line, delimiter = ",") {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells.map((value) => value.trim());
}

export function csvRows(text, delimiter = ",") {
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => splitCsvLine(line, delimiter));
}

// "R$ -1.234,56", "-R$ 2.800,00", "- 3.339,70", "39,99" -> número (ou null)
export function parseBrlAmount(raw) {
  const text = String(raw ?? "").replace(/\s/g, "").replace("R$", "");
  const match = /^([+-]?)(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const [, sign, integer, cents = "0"] = match;
  const value = Number(`${integer.replace(/\./g, "")}.${cents.padEnd(2, "0")}`);
  return sign === "-" ? -value : value;
}

// "03/11/2026" -> "2026-11-03"; "2026-11-03" fica igual
export function parseDate(raw) {
  const text = String(raw ?? "").trim();
  let match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (match) return checkedDate(match[3], match[2], match[1]);
  match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (match) return checkedDate(match[1], match[2], match[3]);
  return null;
}

function checkedDate(year, month, day) {
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const iso = `${year}-${month}-${day}`;
  return date.toISOString().slice(0, 10) === iso ? iso : null;
}

// Sem acentos, minúsculas e espaços simples: base para comparar descrições
export function normalize(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Um erro de leitura vira 400 com a linha do arquivo, para a pessoa achar o problema
export class ParseError extends Error {
  constructor(message, line) {
    super(line ? `${message} (linha ${line})` : message);
    this.line = line;
  }
}

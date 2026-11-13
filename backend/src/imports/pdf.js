// Leitura de PDF para os leitores de extrato: o texto de cada página vira uma
// lista de linhas, cada uma com as células na ordem em que aparecem (x).
//
// Os extratos são tabelas: o que importa é a posição. Por isso cada célula
// guarda o x, e cada linha o y (de cima para baixo). Textos com até 2 pontos
// de diferença na altura ficam na mesma linha.

import { ParseError } from "./text.js";

let pdfjs;
async function loadPdfjs() {
  // A versão "legacy" roda no Node sem precisar de APIs de navegador
  pdfjs ??= await import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjs;
}

export function isPdf(buffer) {
  return buffer.subarray(0, 5).toString("latin1") === "%PDF-";
}

const SAME_LINE = 2;

export async function pdfLines(buffer) {
  const { getDocument } = await loadPdfjs();
  const task = getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, verbosity: 0 });
  let doc;
  try {
    doc = await task.promise;
  } catch {
    await task.destroy();
    throw new ParseError("Não consegui abrir este PDF. Ele pode estar protegido por senha ou corrompido");
  }

  const lines = [];
  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const { items } = await page.getTextContent();
      const cells = items
        .filter((item) => item.str.trim() !== "")
        .map((item) => ({ x: item.transform[4], y: item.transform[5], text: item.str.trim() }))
        .sort((a, b) => b.y - a.y || a.x - b.x);

      const pageLines = [];
      for (const cell of cells) {
        const line = pageLines.find((l) => Math.abs(l.y - cell.y) <= SAME_LINE);
        if (line) line.cells.push(cell);
        else pageLines.push({ page: pageNumber, y: cell.y, cells: [cell] });
      }
      for (const line of pageLines) {
        line.cells.sort((a, b) => a.x - b.x);
        line.text = line.cells.map((c) => c.text).join(" ");
        lines.push(line);
      }
    }
  } finally {
    await task.destroy();
  }
  return lines;
}

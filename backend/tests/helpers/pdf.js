// Monta um PDF simples com textos em posições fixas, para os testes dos
// leitores de extrato em PDF usarem arquivos fictícios no mesmo layout dos
// bancos, sem guardar extratos de verdade no repositório.
//
// pages: [[{ x, y, text }]] — x e y em pontos, a partir do canto inferior esquerdo
// (como no PDF), numa página A4 (595 x 842).

// WinAnsi (Latin-1 + alguns símbolos): o "•" dos cartões do Nubank é 0x95
function encode(text) {
  const bytes = [];
  for (const char of text) {
    if (char === "•") bytes.push(0x95);
    else {
      const code = char.charCodeAt(0);
      if (code > 0xff) throw new Error(`Caractere fora do WinAnsi: ${char}`);
      bytes.push(code);
    }
  }
  return Buffer.from(bytes)
    .toString("latin1")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

export function buildPdf(pages) {
  const objects = [];
  const add = (body) => objects.push(body) && objects.length;

  const catalog = add(null);
  const pagesId = add(null);
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");

  const pageIds = pages.map((cells) => {
    const content = cells.map(({ x, y, text }) => `BT /F1 8 Tf ${x} ${y} Td (${encode(text)}) Tj ET`).join("\n");
    const stream = add(`<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`);
    return add(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${stream} 0 R >>`
    );
  });

  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((body, index) => {
    const offset = Buffer.byteLength(pdf, "latin1");
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

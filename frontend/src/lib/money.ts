// Conversão entre o que a pessoa digita ("1.234,56") e o número da API (1234.56)

export function parseMoney(text: string): number | null {
  const cleaned = text.replace(/[R$\s]/g, "");
  if (!cleaned) return null;

  // Com vírgula: padrão brasileiro (ponto é milhar). Sem vírgula: aceita ponto decimal.
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) return null;

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

// Valor para preencher o campo ao editar: 1234.5 -> "1234,50"
export function moneyToInput(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

export function today(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

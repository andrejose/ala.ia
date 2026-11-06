import { formatMoney } from "../lib/format";

type Tone = "income" | "expense" | "neutral";

const toneClass: Record<Tone, string> = {
  income: "text-income",
  expense: "text-expense",
  neutral: "text-ink",
};

// Valor em R$. Receita e despesa levam sinal (+/−), além da cor,
// para quem não distingue bem as cores.
export function Money({
  value,
  tone = "neutral",
  className = "",
}: {
  value: number;
  tone?: Tone;
  className?: string;
}) {
  const sign = tone === "income" ? "+ " : tone === "expense" ? "− " : value < 0 ? "− " : "";
  const amount = tone === "neutral" ? Math.abs(value) : value;

  return (
    <span className={`tabular whitespace-nowrap ${toneClass[tone]} ${className}`}>
      {sign}
      {formatMoney(amount)}
    </span>
  );
}

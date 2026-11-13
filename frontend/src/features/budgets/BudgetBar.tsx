import { CategoryIcon } from "../../components/CategoryIcon";
import { Money } from "../../components/Money";
import type { Budget } from "../../lib/types";

// Até 80% do limite: tranquilo; até 100%: atenção; acima: passou
export function budgetTone(percent: number) {
  if (percent > 100) return { bar: "bg-expense", text: "text-expense" };
  if (percent >= 80) return { bar: "bg-pending", text: "text-pending" };
  return { bar: "bg-primary", text: "text-muted" };
}

// Linha de uma categoria com limite: quanto foi, de quanto, e a barra
export function BudgetBar({ budget, compact = false }: { budget: Budget; compact?: boolean }) {
  const tone = budgetTone(budget.percent);
  const over = budget.remaining < 0;

  return (
    <div className="flex items-center gap-3">
      {!compact && <CategoryIcon icon={budget.icon} color={budget.color} />}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate font-semibold">{budget.name}</span>
          <span className="shrink-0 text-sm">
            <Money value={budget.spent} className="font-bold" /> <span className="text-muted">de</span>{" "}
            <Money value={budget.amount} className="text-muted" />
          </span>
        </div>
        <div
          className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-label={`${budget.name}: ${budget.percent}% do limite`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(budget.percent, 100)}
        >
          <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${Math.min(budget.percent, 100)}%` }} />
        </div>
        <p className={`mt-1 text-sm ${tone.text}`}>
          {over ? (
            <>
              Passou <Money value={-budget.remaining} className="font-semibold" /> do limite
            </>
          ) : (
            <>
              Faltam <Money value={budget.remaining} className="font-semibold" />
            </>
          )}
          {!compact && budget.pending > 0 && (
            <span className="text-muted">
              {" "}
              · <Money value={budget.pending} /> ainda a pagar
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

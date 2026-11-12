import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatMonth, shiftMonth } from "../lib/format";

// Mês em exibição com setas para o anterior e o próximo (month: "YYYY-MM")
export function MonthSwitcher({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={() => onChange(shiftMonth(month, -1))}
        aria-label="Mês anterior"
        className="grid size-10 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-ink"
      >
        <ChevronLeft className="size-5" aria-hidden="true" />
      </button>
      <h2 className="font-display text-xl font-semibold" aria-live="polite">
        {formatMonth(month)}
      </h2>
      <button
        type="button"
        onClick={() => onChange(shiftMonth(month, 1))}
        aria-label="Próximo mês"
        className="grid size-10 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-ink"
      >
        <ChevronRight className="size-5" aria-hidden="true" />
      </button>
    </div>
  );
}

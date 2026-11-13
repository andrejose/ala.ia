import { ArrowLeftRight, ChevronRight, Plus, Repeat } from "lucide-react";
import { useMemo, useState } from "react";
import { CategoryIcon } from "../../components/CategoryIcon";
import { Money } from "../../components/Money";
import { PageHeader } from "../../components/PageHeader";
import { Button, Card, SectionTitle } from "../../components/ui";
import { shiftMonth, shortMonthName } from "../../lib/format";
import { useAccounts, useCategories, useRecurrences } from "../../lib/queries";
import type { Account, Category, Recurrence } from "../../lib/types";
import { useHousehold } from "../household/HouseholdProvider";
import { useTransactionSheet } from "../transactions/TransactionSheet";
import { RecurrenceSheet } from "./RecurrenceSheet";

// "2026-11" + 10 vezes -> "ago/2027"
function lastMonthLabel(recurrence: Recurrence) {
  const last = shiftMonth(recurrence.start_month, (recurrence.occurrences ?? 1) - 1);
  return `${shortMonthName(last)}/${last.slice(0, 4)}`;
}

export function recurrenceSchedule(recurrence: Recurrence) {
  const day = `Todo dia ${recurrence.day_of_month}`;
  if (recurrence.occurrences === null) return `${day}, sem fim`;
  return `${day}, ${recurrence.occurrences} ${recurrence.occurrences === 1 ? "vez" : "vezes"} (até ${lastMonthLabel(recurrence)})`;
}

export function RecurrencesPage() {
  const { household } = useHousehold();
  const sheet = useTransactionSheet();
  const recurrences = useRecurrences(household?.id);
  const accounts = useAccounts(household?.id);
  const categories = useCategories(household?.id);
  const [editing, setEditing] = useState<Recurrence | null>(null);

  const accountById = useMemo(() => new Map<string, Account>((accounts.data ?? []).map((a) => [a.id, a])), [accounts.data]);
  const categoryById = useMemo(() => new Map<string, Category>((categories.data ?? []).map((c) => [c.id, c])), [categories.data]);

  const all = recurrences.data ?? [];
  const active = all.filter((r) => r.is_active);
  const paused = all.filter((r) => !r.is_active);
  const perMonth = (type: Recurrence["type"]) => active.filter((r) => r.type === type).reduce((sum, r) => sum + r.amount, 0);

  return (
    <>
      <PageHeader
        title="Recorrentes"
        description={
          active.length > 0 ? (
            <>
              Todo mês entra <Money value={perMonth("income")} tone="income" className="font-bold" /> e sai{" "}
              <Money value={perMonth("expense")} tone="expense" className="font-bold" /> sozinho.
            </>
          ) : (
            "Aluguel, salário, assinaturas e parcelas: lance uma vez e cada mês entra sozinho."
          )
        }
        action={
          <Button onClick={() => sheet.openNew("expense", { repeat: true })} className="h-10 px-4 text-sm">
            <Plus className="size-4" aria-hidden="true" />
            Nova
          </Button>
        }
      />

      {recurrences.isPending && <Card className="h-40 animate-pulse" />}

      {recurrences.data && all.length === 0 && (
        <Card className="p-6">
          <Repeat className="size-7 text-primary" aria-hidden="true" />
          <p className="mt-3 font-display text-xl font-semibold">Nada se repete ainda</p>
          <p className="mt-2 max-w-prose text-muted">
            Ao lançar, ligue "Repetir todo mês". Os lançamentos aparecem até o mês seguinte, a pagar ou a receber,
            e você marca como pago quando acontecer. Com débito automático, já entram pagos no dia.
          </p>
          <Button className="mt-5" onClick={() => sheet.openNew("expense", { repeat: true })}>
            Criar recorrente
          </Button>
        </Card>
      )}

      {active.length > 0 && (
        <RecurrenceList label="Recorrentes ativas" items={active} accountById={accountById} categoryById={categoryById} onOpen={setEditing} />
      )}

      {paused.length > 0 && (
        <section aria-labelledby="paused-title" className="mt-8">
          <SectionTitle>
            <span id="paused-title">Pausadas</span>
          </SectionTitle>
          <div className="opacity-80">
            <RecurrenceList label="Recorrentes pausadas" items={paused} accountById={accountById} categoryById={categoryById} onOpen={setEditing} />
          </div>
        </section>
      )}

      {household && (
        <RecurrenceSheet householdId={household.id} recurrence={editing} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

function RecurrenceList({
  label,
  items,
  accountById,
  categoryById,
  onOpen,
}: {
  label: string;
  items: Recurrence[];
  accountById: Map<string, Account>;
  categoryById: Map<string, Category>;
  onOpen: (recurrence: Recurrence) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <ul aria-label={label} className="divide-y divide-line">
        {items.map((r) => {
          const category = r.category_id ? categoryById.get(r.category_id) : undefined;
          const where =
            r.type === "transfer"
              ? `${accountById.get(r.account_id)?.name ?? "Conta"} para ${accountById.get(r.destination_account_id ?? "")?.name ?? "outra conta"}`
              : [category?.name, accountById.get(r.account_id)?.name].filter(Boolean).join(", ");
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onOpen(r)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-surface-2/60"
              >
                {r.type === "transfer" ? (
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-2 text-muted" aria-hidden="true">
                    <ArrowLeftRight className="size-5" />
                  </span>
                ) : (
                  <CategoryIcon icon={category?.icon ?? null} color={category?.color ?? null} />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{r.description}</span>
                  <span className="block truncate text-sm text-muted">{where}</span>
                  <span className="block text-sm text-muted">
                    {recurrenceSchedule(r)}
                    {r.auto_paid && " · débito automático"}
                    {!r.is_active && " · pausada"}
                  </span>
                </span>
                <Money
                  value={r.amount}
                  tone={r.type === "income" ? "income" : r.type === "expense" ? "expense" : "neutral"}
                  className="shrink-0 font-bold"
                />
                <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

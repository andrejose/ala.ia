import { Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { CategoryIcon } from "../../components/CategoryIcon";
import { FormError, MoneyField } from "../../components/fields";
import { Money } from "../../components/Money";
import { MonthSwitcher } from "../../components/MonthSwitcher";
import { PageHeader } from "../../components/PageHeader";
import { Sheet } from "../../components/Sheet";
import { Button, Card, SectionTitle } from "../../components/ui";
import { api } from "../../lib/api";
import { moneyToInput, parseMoney } from "../../lib/money";
import { errorMessage, fieldErrors, useHouseholdMutation } from "../../lib/mutations";
import { currentMonth, useBudgets, useCategories } from "../../lib/queries";
import type { Category } from "../../lib/types";
import { useHousehold } from "../household/HouseholdProvider";
import { BudgetBar, budgetTone } from "./BudgetBar";

interface Editing {
  categoryId: string;
  name: string;
  amount?: number;
}

export function BudgetsPage() {
  const { household } = useHousehold();
  const [month, setMonth] = useState(currentMonth());
  const budgets = useBudgets(household?.id, month);
  const categories = useCategories(household?.id);
  const [editing, setEditing] = useState<Editing | null>(null);

  const list = budgets.data?.budgets ?? [];
  const withBudget = new Set(list.map((b) => b.category_id));
  const without = (categories.data ?? []).filter((c: Category) => c.type === "expense" && c.is_active && !withBudget.has(c.id));
  const total = budgets.data?.total;
  const totalPercent = total && total.amount > 0 ? Math.round((total.spent / total.amount) * 100) : 0;

  return (
    <>
      <PageHeader title="Orçamento" description="Um limite por mês para cada categoria de despesa. Vale para todos os meses." />

      <div className="mb-4">
        <MonthSwitcher month={month} onChange={setMonth} />
      </div>

      {budgets.isPending && <Card className="h-40 animate-pulse" />}

      {total && list.length > 0 && (
        <Card className="mb-4 p-5">
          <p className="text-sm font-semibold text-muted">No mês, somando os limites</p>
          <p className="mt-1 font-display text-2xl font-semibold">
            <Money value={total.spent} /> <span className="text-lg text-muted">de</span> <Money value={total.amount} className="text-lg text-muted" />
          </p>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface-2" role="presentation">
            <div className={`h-full rounded-full ${budgetTone(totalPercent).bar}`} style={{ width: `${Math.min(totalPercent, 100)}%` }} />
          </div>
          <p className="mt-2 text-sm text-muted">
            {total.remaining >= 0 ? (
              <>
                Ainda cabem <Money value={total.remaining} className="font-semibold text-ink" /> neste mês.
              </>
            ) : (
              <>
                O mês passou <Money value={-total.remaining} className="font-semibold text-expense" /> do total dos limites.
              </>
            )}
          </p>
        </Card>
      )}

      {budgets.data && list.length === 0 && (
        <Card className="mb-4 p-6">
          <p className="font-display text-xl font-semibold">Nenhum limite ainda</p>
          <p className="mt-2 max-w-prose text-muted">
            Escolha uma categoria abaixo e diga quanto quer gastar nela por mês. A barra mostra quanto já foi, com as
            contas a pagar incluídas.
          </p>
        </Card>
      )}

      {list.length > 0 && (
        <Card className="overflow-hidden">
          <ul aria-label="Limites do mês" className="divide-y divide-line">
            {list.map((budget) => (
              <li key={budget.category_id}>
                <button
                  type="button"
                  onClick={() => setEditing({ categoryId: budget.category_id, name: budget.name, amount: budget.amount })}
                  className="w-full px-4 py-4 text-left transition hover:bg-surface-2/60"
                >
                  <BudgetBar budget={budget} />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {without.length > 0 && (
        <section aria-labelledby="no-budget-title" className="mt-8">
          <SectionTitle>
            <span id="no-budget-title">Sem limite</span>
          </SectionTitle>
          <Card className="overflow-hidden">
            <ul className="divide-y divide-line">
              {without.map((category) => (
                <li key={category.id} className="flex items-center gap-3 px-4 py-3">
                  <CategoryIcon icon={category.icon} color={category.color} />
                  <span className="min-w-0 flex-1 truncate font-semibold">{category.name}</span>
                  <Button
                    variant="soft"
                    className="h-9 px-3 text-sm"
                    aria-label={`Definir limite de ${category.name}`}
                    onClick={() => setEditing({ categoryId: category.id, name: category.name })}
                  >
                    <Plus className="size-4" aria-hidden="true" />
                    Limite
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      {household && (
        <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing ? `Limite de ${editing.name}` : "Limite"}>
          {editing && <BudgetForm key={editing.categoryId} householdId={household.id} editing={editing} onDone={() => setEditing(null)} />}
        </Sheet>
      )}
    </>
  );
}

function BudgetForm({ householdId, editing, onDone }: { householdId: string; editing: Editing; onDone: () => void }) {
  const [amount, setAmount] = useState(editing.amount ? moneyToInput(editing.amount) : "");
  const [localError, setLocalError] = useState<string>();
  const base = `/households/${householdId}/budgets/${editing.categoryId}`;
  const save = useHouseholdMutation(householdId, (value: number) => api.put(base, { amount: value }));
  const remove = useHouseholdMutation(householdId, () => api.delete(base));
  const busy = save.isPending || remove.isPending;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const value = parseMoney(amount);
    if (value === null || value <= 0) return setLocalError("Informe um valor maior que zero. Ex.: 800,00");
    setLocalError(undefined);
    save.mutate(value, { onSuccess: onDone });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <MoneyField
        id="budget-amount"
        label="Limite por mês"
        value={amount}
        onChange={setAmount}
        error={localError ?? fieldErrors(save.error).amount}
        hint="Quanto você quer gastar nesta categoria a cada mês."
        large
        autoFocus
      />
      {(save.error || remove.error) && <FormError>{errorMessage(save.error) ?? errorMessage(remove.error)}</FormError>}
      <Button type="submit" className="w-full" disabled={busy}>
        {save.isPending ? "Salvando…" : "Salvar limite"}
      </Button>
      {editing.amount !== undefined && (
        <div className="flex justify-end border-t border-line pt-4">
          <Button type="button" variant="ghost" disabled={busy} onClick={() => remove.mutate(undefined, { onSuccess: onDone })}>
            Tirar limite
          </Button>
        </div>
      )}
    </form>
  );
}

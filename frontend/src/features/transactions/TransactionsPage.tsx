import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { SelectField } from "../../components/fields";
import { MonthSwitcher } from "../../components/MonthSwitcher";
import { PageHeader } from "../../components/PageHeader";
import { Button, Card } from "../../components/ui";
import { api } from "../../lib/api";
import { formatMonth } from "../../lib/format";
import { today } from "../../lib/money";
import { useHouseholdMutation } from "../../lib/mutations";
import { currentMonth, useAccounts, useCategories, useTransactions, type TransactionFilters } from "../../lib/queries";
import type { Account, Category, Transaction } from "../../lib/types";
import { useHousehold } from "../household/HouseholdProvider";
import { TransactionRow } from "./TransactionRow";
import { useTransactionSheet } from "./TransactionSheet";

function monthRange(yearMonth: string) {
  const [year, month] = yearMonth.split("-").map(Number);
  const last = new Date(year, month, 0).getDate();
  return { from: `${yearMonth}-01`, to: `${yearMonth}-${String(last).padStart(2, "0")}` };
}

// "2026-11-06" -> "Sexta, 6 de novembro"
function dayHeading(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const text = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(y, m - 1, d));
  return text.charAt(0).toUpperCase() + text.slice(1).replace("-feira", "");
}

const typeFilters = [
  { value: "", label: "Todos" },
  { value: "expense", label: "Despesas" },
  { value: "income", label: "Receitas" },
  { value: "transfer", label: "Transferências" },
] as const;

export function TransactionsPage() {
  const { household } = useHousehold();
  const sheet = useTransactionSheet();
  const [month, setMonth] = useState(currentMonth());
  const [type, setType] = useState<TransactionFilters["type"] | "">("");
  const [status, setStatus] = useState<TransactionFilters["status"] | "">("");
  const [accountId, setAccountId] = useState("");

  const filters: TransactionFilters = {
    ...monthRange(month),
    type: type || undefined,
    status: status || undefined,
    account_id: accountId || undefined,
  };

  const list = useTransactions(household?.id, filters);
  const accounts = useAccounts(household?.id);
  const categories = useCategories(household?.id);
  const markPaid = useHouseholdMutation(household?.id, (tx: Transaction) =>
    api.patch(`/households/${household!.id}/transactions/${tx.id}`, { payment_date: today() })
  );

  const accountById = useMemo(() => new Map<string, Account>((accounts.data ?? []).map((a) => [a.id, a])), [accounts.data]);
  const categoryById = useMemo(() => new Map<string, Category>((categories.data ?? []).map((c) => [c.id, c])), [categories.data]);

  const items = list.data?.pages.flatMap((p) => p.data) ?? [];
  const total = list.data?.pages[0]?.pagination.total ?? 0;

  // Agrupa por dia de vencimento, mantendo a ordem da API (mais recente primeiro)
  const groups: Array<{ date: string; items: Transaction[] }> = [];
  for (const tx of items) {
    const last = groups.at(-1);
    if (last?.date === tx.due_date) last.items.push(tx);
    else groups.push({ date: tx.due_date, items: [tx] });
  }

  const hasFilters = !!(type || status || accountId);

  return (
    <>
      <PageHeader
        title="Lançamentos"
        action={
          <Button onClick={() => sheet.openNew()} className="h-10 px-4 text-sm">
            <Plus className="size-4" aria-hidden="true" />
            Novo
          </Button>
        }
      />

      {/* Mês */}
      <div className="mb-4">
        <MonthSwitcher month={month} onChange={setMonth} />
      </div>

      {/* Filtros */}
      <div className="mb-5 space-y-3">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="group" aria-label="Tipo">
          {typeFilters.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={type === f.value}
              onClick={() => setType(f.value)}
              className={`h-9 shrink-0 rounded-full px-4 text-sm font-bold transition ${
                type === f.value ? "bg-ink text-bg" : "bg-surface-2 text-muted hover:text-ink"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <SelectField id="filter-status" label="Situação" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="">Todos</option>
            <option value="paid">Pagos e recebidos</option>
            <option value="pending">Pendentes</option>
          </SelectField>
          <SelectField id="filter-account" label="Conta" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Todas</option>
            {(accounts.data ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </SelectField>
        </div>
      </div>

      {list.isLoading && <Card className="h-48 animate-pulse" />}

      {list.isError && (
        <Card className="p-6">
          <p className="font-semibold">Não foi possível carregar os lançamentos.</p>
          <Button variant="soft" className="mt-4" onClick={() => list.refetch()}>
            Tentar de novo
          </Button>
        </Card>
      )}

      {list.data && items.length === 0 && (
        <Card className="p-6">
          <p className="font-semibold">
            {hasFilters ? "Nenhum lançamento com esses filtros." : `Nenhum lançamento em ${formatMonth(month).toLowerCase()}.`}
          </p>
          <p className="mt-1 text-muted">
            {hasFilters ? "Tente outro filtro ou outro mês." : "Registre uma receita ou despesa para começar a acompanhar o mês."}
          </p>
          {!hasFilters && (
            <Button variant="soft" className="mt-4" onClick={() => sheet.openNew()}>
              Novo lançamento
            </Button>
          )}
        </Card>
      )}

      {groups.length > 0 && (
        <>
          <p className="mb-3 text-sm text-muted">
            {total} {total === 1 ? "lançamento" : "lançamentos"}
          </p>
          <div className="space-y-5">
            {groups.map((group) => (
              <section key={group.date} aria-label={dayHeading(group.date)}>
                <h3 className="mb-2 px-1 text-sm font-bold text-muted">{dayHeading(group.date)}</h3>
                <Card className="divide-y divide-line overflow-hidden">
                  {group.items.map((tx) => (
                    <TransactionRow
                      key={tx.id}
                      transaction={tx}
                      category={tx.category_id ? categoryById.get(tx.category_id) : undefined}
                      accountById={accountById}
                      onOpen={() => sheet.openEdit(tx)}
                      onMarkPaid={() => markPaid.mutate(tx)}
                      showDate={false}
                    />
                  ))}
                </Card>
              </section>
            ))}
          </div>

          {list.hasNextPage && (
            <div className="mt-6 text-center">
              <Button variant="soft" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
                {list.isFetchingNextPage ? "Carregando…" : "Carregar mais"}
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}

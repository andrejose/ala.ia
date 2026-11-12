import { ArrowDownLeft, ArrowUpRight, Scale } from "lucide-react";
import { useState, type ReactNode } from "react";
import { CategoryIcon } from "../../components/CategoryIcon";
import { Money } from "../../components/Money";
import { MonthSwitcher } from "../../components/MonthSwitcher";
import { PageHeader } from "../../components/PageHeader";
import { Card, SectionTitle } from "../../components/ui";
import { formatMoney, formatMonth, monthName, shiftMonth, shortMonthName } from "../../lib/format";
import { currentMonth, useMonthlySeries, useSpendingByCategory } from "../../lib/queries";
import type { CategoryType, ReportByCategory, ReportSummary } from "../../lib/types";
import { useHousehold } from "../household/HouseholdProvider";

// Quantos meses o gráfico "mês a mês" mostra, terminando no mês escolhido
const SERIES_LENGTH = 6;

// Cor de quem não tem cor cadastrada, na ordem em que aparecem
const fallbackColors = ["var(--primary)", "var(--accent)", "var(--pending)", "var(--muted)"];

type CategoryRow = ReportByCategory["categories"][number];

function colorOf(category: CategoryRow, index: number) {
  return category.color ?? fallbackColors[index % fallbackColors.length];
}

function percent(part: number, whole: number) {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

export function ReportsPage() {
  const { household } = useHousehold();
  const [month, setMonth] = useState(currentMonth());
  // Último mês do gráfico. Só anda quando o mês escolhido sai da janela, para
  // o gráfico não pular ao tocar num mês que já está nele.
  const [windowEnd, setWindowEnd] = useState(month);
  const [type, setType] = useState<CategoryType>("expense");

  const windowStart = shiftMonth(windowEnd, -(SERIES_LENGTH - 1));
  // Um mês a mais no começo, para comparar o primeiro mês da janela com o anterior
  const series = useMonthlySeries(household?.id, shiftMonth(windowStart, -1), windowEnd);
  const all = series.data?.months ?? [];
  const months = all.filter((m) => m.month >= windowStart && m.month <= windowEnd);
  const selected = all.find((m) => m.month === month);
  const previous = all.find((m) => m.month === shiftMonth(month, -1));

  function changeMonth(next: string) {
    setMonth(next);
    if (next > windowEnd) setWindowEnd(next);
    else if (next < windowStart) setWindowEnd(shiftMonth(next, SERIES_LENGTH - 1));
  }

  return (
    <>
      <PageHeader title="Relatórios" description="Para onde vai o dinheiro, mês a mês." />

      <div className="mb-5">
        <MonthSwitcher month={month} onChange={changeMonth} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <MonthTotals summary={selected} loading={series.isPending} />
          <Comparison current={selected} previous={previous} />
          <MonthlyChart months={months} selected={month} loading={series.isPending} onSelect={changeMonth} />
        </div>
        <div className="min-w-0">
          <ByCategory householdId={household?.id} month={month} type={type} onTypeChange={setType} />
        </div>
      </div>

      <p className="mt-6 text-sm text-muted">
        Os valores contam pelo mês de vencimento e incluem o que ainda está a pagar ou a receber. Transferências entre
        contas não entram.
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Entrou, saiu e resultado do mês
// ---------------------------------------------------------------------------
function MonthTotals({ summary, loading }: { summary: ReportSummary | undefined; loading: boolean }) {
  return (
    // Três lado a lado só quando a coluna tem largura para valores grandes
    <section aria-label="Totais do mês" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
      <TotalTile
        label="Entrou"
        icon={<ArrowDownLeft className="size-4" aria-hidden="true" />}
        soft="bg-income-soft text-income"
        value={summary?.income.total}
        pending={summary?.income.pending}
        pendingLabel="a receber"
        loading={loading}
      />
      <TotalTile
        label="Saiu"
        icon={<ArrowUpRight className="size-4" aria-hidden="true" />}
        soft="bg-expense-soft text-expense"
        value={summary?.expense.total}
        pending={summary?.expense.pending}
        pendingLabel="a pagar"
        loading={loading}
      />
      <TotalTile
        label="Resultado"
        icon={<Scale className="size-4" aria-hidden="true" />}
        soft="bg-primary-soft text-primary"
        value={summary?.balance.total}
        loading={loading}
        className="col-span-2 sm:col-span-1 lg:col-span-2 xl:col-span-1"
      />
    </section>
  );
}

function TotalTile({
  label,
  icon,
  soft,
  value,
  pending,
  pendingLabel,
  loading,
  className = "",
}: {
  label: string;
  icon: ReactNode;
  soft: string;
  value: number | undefined;
  pending?: number;
  pendingLabel?: string;
  loading: boolean;
  className?: string;
}) {
  return (
    <Card className={`p-4 ${className}`}>
      <div className="flex items-center gap-2 text-sm font-bold text-muted">
        <span className={`grid size-7 place-items-center rounded-full ${soft}`}>{icon}</span>
        {label}
      </div>
      <p className="mt-2 font-display text-xl font-semibold">
        {loading ? <Skeleton className="h-7 w-24" /> : <Money value={value ?? 0} />}
      </p>
      {!!pending && pending > 0 && (
        <p className="mt-1 text-xs font-semibold text-pending">
          <Money value={pending} className="text-pending" /> {pendingLabel}
        </p>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Comparação com o mês anterior
// ---------------------------------------------------------------------------
function Comparison({ current, previous }: { current: ReportSummary | undefined; previous: ReportSummary | undefined }) {
  if (!current || !previous) return null;

  const spent = current.expense.total;
  const before = previous.expense.total;
  const previousName = monthName(previous.month);
  const diff = spent - before;

  let sentence: ReactNode;
  if (spent === 0 && before === 0) {
    sentence = <>Nenhuma despesa neste mês nem em {previousName}.</>;
  } else if (before === 0) {
    sentence = <>Em {previousName} não houve despesas; neste mês saíram <Money value={spent} className="font-bold" />.</>;
  } else if (Math.abs(diff) < 0.005) {
    sentence = <>Você gastou o mesmo que em {previousName}.</>;
  } else {
    const more = diff > 0;
    sentence = (
      <>
        Você gastou{" "}
        <strong className={more ? "text-expense" : "text-income"}>
          <Money value={Math.abs(diff)} className={more ? "text-expense" : "text-income"} /> {more ? "a mais" : "a menos"}
        </strong>{" "}
        que em {previousName} ({more ? "+" : "−"}
        {percent(Math.abs(diff), before)}%).
      </>
    );
  }

  return (
    <Card className="p-4">
      <p className="text-sm leading-relaxed">{sentence}</p>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Mês a mês: barras de receitas e despesas; tocar num mês o seleciona
// ---------------------------------------------------------------------------
function MonthlyChart({
  months,
  selected,
  loading,
  onSelect,
}: {
  months: ReportSummary[];
  selected: string;
  loading: boolean;
  onSelect: (month: string) => void;
}) {
  const max = Math.max(0, ...months.flatMap((m) => [m.income.total, m.expense.total]));
  const height = (value: number) => (max > 0 ? `${Math.max((value / max) * 100, value > 0 ? 2 : 0)}%` : "0%");
  const average = months.length > 0 ? months.reduce((sum, m) => sum + m.expense.total, 0) / months.length : 0;

  return (
    <section aria-labelledby="monthly-title">
      <SectionTitle action={<Legend />}>
        <span id="monthly-title">Mês a mês</span>
      </SectionTitle>

      <Card className="p-4 sm:p-5">
        {loading ? (
          <Skeleton className="h-44 w-full" />
        ) : (
          <div className="grid h-44 grid-cols-6 gap-1 sm:gap-2" role="group" aria-label="Receitas e despesas por mês">
            {months.map((m) => {
              const isSelected = m.month === selected;
              return (
                <button
                  key={m.month}
                  type="button"
                  onClick={() => onSelect(m.month)}
                  aria-pressed={isSelected}
                  aria-label={`${formatMonth(m.month)}: entrou ${formatMoney(m.income.total)}, saiu ${formatMoney(m.expense.total)}`}
                  className={`flex min-w-0 flex-col items-stretch rounded-xl px-1 pt-2 pb-1 transition ${
                    isSelected ? "bg-surface-2" : "hover:bg-surface-2/60"
                  }`}
                >
                  <span className="flex flex-1 items-end justify-center gap-1" aria-hidden="true">
                    <span className="w-2.5 rounded-t-md bg-income sm:w-3.5" style={{ height: height(m.income.total) }} />
                    <span className="w-2.5 rounded-t-md bg-expense sm:w-3.5" style={{ height: height(m.expense.total) }} />
                  </span>
                  <span
                    className={`mt-1.5 text-center text-xs font-bold ${isSelected ? "text-ink" : "text-muted"}`}
                    aria-hidden="true"
                  >
                    {shortMonthName(m.month)}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {!loading && months.length > 0 && (
          <p className="mt-3 border-t border-line pt-3 text-sm text-muted">
            Média de despesas nos {months.length} meses: <Money value={average} className="font-bold text-ink" /> por mês
          </p>
        )}
      </Card>
    </section>
  );
}

function Legend() {
  return (
    <span className="flex items-center gap-3 text-xs font-bold text-muted" aria-hidden="true">
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-income" />
        Entrou
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-expense" />
        Saiu
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Por categoria: rosca + lista, para despesas ou receitas
// ---------------------------------------------------------------------------
const typeOptions: Array<{ value: CategoryType; label: string }> = [
  { value: "expense", label: "Despesas" },
  { value: "income", label: "Receitas" },
];

function ByCategory({
  householdId,
  month,
  type,
  onTypeChange,
}: {
  householdId: string | undefined;
  month: string;
  type: CategoryType;
  onTypeChange: (type: CategoryType) => void;
}) {
  const { data, isPending } = useSpendingByCategory(householdId, month, type);
  const categories = data?.categories ?? [];
  const total = data?.total ?? 0;

  return (
    <section aria-labelledby="by-category-title">
      <SectionTitle>
        <span id="by-category-title">Por categoria</span>
      </SectionTitle>

      <Card className="p-5">
        <div className="mb-5 flex gap-2" role="group" aria-label="Tipo">
          {typeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={type === option.value}
              onClick={() => onTypeChange(option.value)}
              className={`h-9 rounded-full px-4 text-sm font-bold transition ${
                type === option.value ? "bg-primary text-primary-ink" : "bg-surface-2 text-muted hover:text-ink"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {isPending && <Skeleton className="mx-auto size-40 rounded-full" />}

        {data && categories.length === 0 && (
          <p className="py-6 text-center text-sm text-muted">
            Nenhuma {type === "expense" ? "despesa" : "receita"} em {monthName(month)}.
          </p>
        )}

        {categories.length > 0 && (
          <>
            <Donut categories={categories} total={total} type={type} />
            <ul className="mt-6 space-y-4" aria-label={type === "expense" ? "Despesas por categoria" : "Receitas por categoria"}>
              {categories.map((c, index) => {
                const share = percent(c.total, total);
                return (
                  <li key={c.category_id} className="flex items-center gap-3">
                    <CategoryIcon icon={c.icon} color={c.color} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="truncate font-semibold">{c.name}</span>
                        <Money value={c.total} className="font-bold" />
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2" role="presentation">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${(c.total / total) * 100}%`, backgroundColor: colorOf(c, index) }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        {c.transaction_count} {c.transaction_count === 1 ? "lançamento" : "lançamentos"}
                        {c.pending > 0 && (
                          <>
                            {" · "}
                            <Money value={c.pending} className="text-pending" />{" "}
                            <span className="text-pending">{type === "expense" ? "a pagar" : "a receber"}</span>
                          </>
                        )}
                      </p>
                    </div>
                    <span className="w-10 self-start text-right text-xs font-bold text-muted tabular">{share}%</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>
    </section>
  );
}

// Rosca em SVG: cada categoria é um arco do círculo, proporcional ao total
function Donut({ categories, total, type }: { categories: CategoryRow[]; total: number; type: CategoryType }) {
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  // Um respiro entre as fatias, quando há mais de uma
  const gap = categories.length > 1 ? 1.5 : 0;
  let offset = 0;

  return (
    <div className="relative mx-auto size-44">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--surface-2)" strokeWidth="14" />
        {categories.map((c, index) => {
          const length = (c.total / total) * circumference;
          const arc = (
            <circle
              key={c.category_id}
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke={colorOf(c, index)}
              strokeWidth="14"
              strokeDasharray={`${Math.max(length - gap, 0)} ${circumference}`}
              strokeDashoffset={-offset}
            />
          );
          offset += length;
          return arc;
        })}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-xs font-bold text-muted">{type === "expense" ? "Saiu" : "Entrou"}</p>
          <p className="font-display text-lg font-semibold">
            <Money value={total} />
          </p>
        </div>
      </div>
    </div>
  );
}

function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`block animate-pulse rounded-xl bg-surface-2 ${className}`} aria-hidden="true" />;
}

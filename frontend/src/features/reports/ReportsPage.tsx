import { ArrowDownLeft, ArrowUpRight, Scale } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { CategoryIcon } from "../../components/CategoryIcon";
import { Segmented } from "../../components/fields";
import { Money } from "../../components/Money";
import { MonthSwitcher } from "../../components/MonthSwitcher";
import { PageHeader } from "../../components/PageHeader";
import { Card, SectionTitle, TextField } from "../../components/ui";
import {
  addDays,
  addMonthsToDate,
  daysBetween,
  formatDate,
  formatMoney,
  formatMonth,
  monthName,
  shiftMonth,
  shortMonthName,
} from "../../lib/format";
import { today } from "../../lib/money";
import { currentMonth, useMonthlySeries, usePeriodSummary, useSpendingByCategory, type ReportRange } from "../../lib/queries";
import type { CategoryType, ReportByCategory, ReportSummary } from "../../lib/types";
import { useHousehold } from "../household/HouseholdProvider";

// Quantos meses o gráfico "mês a mês" mostra, terminando no mês escolhido
const SERIES_LENGTH = 6;
// Maior período aceito pela API
const MAX_PERIOD_MONTHS = 24;

// Cor de quem não tem cor cadastrada, na ordem em que aparecem
const fallbackColors = ["var(--primary)", "var(--accent)", "var(--pending)", "var(--muted)"];

type CategoryRow = ReportByCategory["categories"][number];
type Mode = "month" | "period";
interface Period {
  from: string;
  to: string;
}

function colorOf(category: CategoryRow, index: number) {
  return category.color ?? fallbackColors[index % fallbackColors.length];
}

function percent(part: number, whole: number) {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// O período fica no endereço (?de=...&ate=...): recarregar ou compartilhar o
// link mostra o mesmo período. Sem ele, a tela fica no modo Mês, como antes.
export function ReportsPage() {
  const { household } = useHousehold();
  const [params, setParams] = useSearchParams();
  const from = params.get("de");
  const to = params.get("ate");
  const period = from && to && ISO_DATE.test(from) && ISO_DATE.test(to) ? { from, to } : null;
  const mode: Mode = period ? "period" : "month";
  const [type, setType] = useState<CategoryType>("expense");
  // Mês a mostrar ao voltar para o modo Mês (ex.: tocando num mês do gráfico do período)
  const [month, setMonth] = useState(currentMonth());

  function changePeriod(next: Period) {
    setParams({ de: next.from, ate: next.to }, { replace: true });
  }

  function changeMode(next: Mode) {
    if (next === "period") changePeriod(presets()[0].period);
    else setParams({}, { replace: true });
  }

  function openMonth(next: string) {
    setMonth(next);
    setParams({}, { replace: true });
  }

  return (
    <>
      <PageHeader
        title="Relatórios"
        description={mode === "month" ? "Para onde vai o dinheiro, mês a mês." : "Para onde foi o dinheiro no período escolhido."}
      />

      <div className="mb-5 max-w-xs">
        <Segmented
          label="Ver por"
          value={mode}
          onChange={changeMode}
          options={[
            { value: "month", label: "Mês" },
            { value: "period", label: "Período" },
          ]}
        />
      </div>

      {period ? (
        <PeriodReport householdId={household?.id} period={period} onChange={changePeriod} type={type} onTypeChange={setType} onOpenMonth={openMonth} />
      ) : (
        <MonthReport householdId={household?.id} initialMonth={month} type={type} onTypeChange={setType} />
      )}

      <p className="mt-6 text-sm text-muted">
        Os valores contam pela data de vencimento e incluem o que ainda está a pagar ou a receber. Transferências entre
        contas não entram.
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Modo Mês: um mês por vez, com o gráfico dos últimos 6 meses
// ---------------------------------------------------------------------------
function MonthReport({
  householdId,
  initialMonth,
  type,
  onTypeChange,
}: {
  householdId: string | undefined;
  initialMonth: string;
  type: CategoryType;
  onTypeChange: (type: CategoryType) => void;
}) {
  const [month, setMonth] = useState(initialMonth);
  // Último mês do gráfico. Só anda quando o mês escolhido sai da janela, para
  // o gráfico não pular ao tocar num mês que já está nele.
  const [windowEnd, setWindowEnd] = useState(initialMonth);

  const windowStart = shiftMonth(windowEnd, -(SERIES_LENGTH - 1));
  // Um mês a mais no começo, para comparar o primeiro mês da janela com o anterior
  const series = useMonthlySeries(householdId, shiftMonth(windowStart, -1), windowEnd);
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
      <div className="mb-5">
        <MonthSwitcher month={month} onChange={changeMonth} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <Totals label="Totais do mês" summary={selected} loading={series.isPending} />
          {selected && previous && (
            <Comparison
              current={selected}
              previous={previous}
              here="neste mês"
              there={`em ${monthName(previous.month)}`}
              thereShort={monthName(previous.month)}
            />
          )}
          <MonthlyChart
            title="Mês a mês"
            months={months}
            selected={month}
            loading={series.isPending}
            onSelect={changeMonth}
            footer={(average) => (
              <>
                Média de despesas nos {months.length} meses: <Money value={average} className="font-bold text-ink" /> por mês
              </>
            )}
          />
        </div>
        <div className="min-w-0">
          <ByCategory householdId={householdId} range={month} emptyWhen={`em ${monthName(month)}`} type={type} onTypeChange={onTypeChange} />
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Modo Período: datas De e Até, com atalhos
// ---------------------------------------------------------------------------
function presets(): Array<{ label: string; period: Period }> {
  const day = today();
  const year = Number(day.slice(0, 4));
  return [
    { label: "Últimos 30 dias", period: { from: addDays(day, -29), to: day } },
    { label: "Últimos 3 meses", period: { from: addDays(addMonthsToDate(day, -3), 1), to: day } },
    { label: "Este ano", period: { from: `${year}-01-01`, to: `${year}-12-31` } },
    { label: "Ano passado", period: { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` } },
  ];
}

function periodProblem({ from, to }: Period): string | null {
  if (from > to) return "A data inicial precisa ser antes da final.";
  if (addMonthsToDate(from, MAX_PERIOD_MONTHS) <= to) return `Escolha um período de no máximo ${MAX_PERIOD_MONTHS} meses.`;
  return null;
}

function PeriodReport({
  householdId,
  period,
  onChange,
  type,
  onTypeChange,
  onOpenMonth,
}: {
  householdId: string | undefined;
  period: Period;
  onChange: (period: Period) => void;
  type: CategoryType;
  onTypeChange: (type: CategoryType) => void;
  onOpenMonth: (month: string) => void;
}) {
  const problem = periodProblem(period);
  const valid = problem === null;
  const days = daysBetween(period.from, period.to);
  // Período anterior, do mesmo tamanho, para a comparação
  const previousTo = addDays(period.from, -1);
  const previousFrom = addDays(previousTo, -(days - 1));

  const summary = usePeriodSummary(householdId, period.from, period.to, valid);
  const previous = usePeriodSummary(householdId, previousFrom, previousTo, valid);
  // Uma barra só não diz nada: o gráfico aparece quando o período passa de um mês
  const spansMonths = period.from.slice(0, 7) !== period.to.slice(0, 7);
  const series = useMonthlySeries(householdId, period.from, period.to, valid && spansMonths);
  const daysLabel = `${days} ${days === 1 ? "dia" : "dias"}`;

  return (
    <>
      <PeriodPicker period={period} onChange={onChange} problem={problem} />

      {valid && (
        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-6">
            <p className="text-sm font-semibold text-muted" aria-live="polite">
              {formatDate(period.from)} a {formatDate(period.to)} · {daysLabel}
            </p>
            <Totals label="Totais do período" summary={summary.data} loading={summary.isPending} />
            {summary.data && previous.data && (
              <Comparison
                current={summary.data}
                previous={previous.data}
                here="neste período"
                there={`nos ${daysLabel} anteriores`}
                thereShort={`nos ${daysLabel} anteriores`}
              />
            )}
            {spansMonths && (
              <MonthlyChart
                title="Mês a mês no período"
                months={series.data?.months ?? []}
                selected={null}
                loading={series.isPending}
                onSelect={onOpenMonth}
                footer={() => <>O primeiro e o último mês contam só os dias do período. Toque num mês para vê-lo inteiro.</>}
              />
            )}
          </div>
          <div className="min-w-0">
            <ByCategory
              householdId={householdId}
              range={period}
              emptyWhen="no período"
              type={type}
              onTypeChange={onTypeChange}
            />
          </div>
        </div>
      )}
    </>
  );
}

function PeriodPicker({ period, onChange, problem }: { period: Period; onChange: (period: Period) => void; problem: string | null }) {
  const options = presets();
  return (
    <Card className="p-4 sm:p-5">
      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <TextField
          id="period-from"
          type="date"
          label="De"
          value={period.from}
          max={period.to}
          onChange={(e) => e.target.value && onChange({ ...period, from: e.target.value })}
          required
        />
        <TextField
          id="period-to"
          type="date"
          label="Até"
          value={period.to}
          min={period.from}
          onChange={(e) => e.target.value && onChange({ ...period, to: e.target.value })}
          required
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Atalhos de período">
        {options.map((option) => {
          const active = option.period.from === period.from && option.period.to === period.to;
          return (
            <button
              key={option.label}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.period)}
              className={`h-9 rounded-full px-4 text-sm font-bold transition ${
                active ? "bg-primary text-primary-ink" : "bg-surface-2 text-muted hover:text-ink"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {problem && (
        <p role="alert" className="mt-3 text-sm font-semibold text-expense">
          {problem}
        </p>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Entrou, saiu e resultado
// ---------------------------------------------------------------------------
type Totals = Pick<ReportSummary, "income" | "expense" | "balance">;

function Totals({ label, summary, loading }: { label: string; summary: Totals | undefined; loading: boolean }) {
  return (
    // Três lado a lado só quando a coluna tem largura para valores grandes
    <section aria-label={label} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
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
// Comparação com o mês anterior (ou com o período anterior, do mesmo tamanho)
// ---------------------------------------------------------------------------
function Comparison({
  current,
  previous,
  here,
  there,
  thereShort,
}: {
  current: Totals;
  previous: Totals;
  /** "neste mês" / "neste período" */
  here: string;
  /** "em outubro" / "nos 30 dias anteriores" */
  there: string;
  /** "outubro" / "nos 30 dias anteriores" (depois de "nem") */
  thereShort: string;
}) {
  const spent = current.expense.total;
  const before = previous.expense.total;
  const diff = spent - before;
  const capitalized = there.charAt(0).toUpperCase() + there.slice(1);

  let sentence: ReactNode;
  if (spent === 0 && before === 0) {
    sentence = <>Nenhuma despesa {here} nem {thereShort.startsWith("nos") ? thereShort : `em ${thereShort}`}.</>;
  } else if (before === 0) {
    sentence = (
      <>
        {capitalized} não houve despesas; {here} saíram <Money value={spent} className="font-bold" />.
      </>
    );
  } else if (Math.abs(diff) < 0.005) {
    sentence = <>Você gastou o mesmo que {there}.</>;
  } else {
    const more = diff > 0;
    sentence = (
      <>
        Você gastou{" "}
        <strong className={more ? "text-expense" : "text-income"}>
          <Money value={Math.abs(diff)} className={more ? "text-expense" : "text-income"} /> {more ? "a mais" : "a menos"}
        </strong>{" "}
        que {there} ({more ? "+" : "−"}
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
// Mês a mês: barras de receitas e despesas; tocar num mês o abre
// ---------------------------------------------------------------------------
function MonthlyChart({
  title,
  months,
  selected,
  loading,
  onSelect,
  footer,
}: {
  title: string;
  months: ReportSummary[];
  selected: string | null;
  loading: boolean;
  onSelect: (month: string) => void;
  footer: (average: number) => ReactNode;
}) {
  const max = Math.max(0, ...months.flatMap((m) => [m.income.total, m.expense.total]));
  const height = (value: number) => (max > 0 ? `${Math.max((value / max) * 100, value > 0 ? 2 : 0)}%` : "0%");
  const average = months.length > 0 ? months.reduce((sum, m) => sum + m.expense.total, 0) / months.length : 0;
  const crowded = months.length > 12;

  return (
    <section aria-labelledby="monthly-title">
      <SectionTitle action={<Legend />}>
        <span id="monthly-title">{title}</span>
      </SectionTitle>

      <Card className="p-4 sm:p-5">
        {loading ? (
          <Skeleton className="h-44 w-full" />
        ) : (
          <div
            className={`grid h-44 ${crowded ? "gap-px sm:gap-1" : "gap-1 sm:gap-2"}`}
            style={{ gridTemplateColumns: `repeat(${Math.max(months.length, 1)}, minmax(0, 1fr))` }}
            role="group"
            aria-label="Receitas e despesas por mês"
          >
            {months.map((m, index) => {
              const isSelected = m.month === selected;
              // Com muitos meses, o nome aparece a cada três (a barra continua lá)
              const showLabel = !crowded || index % 3 === 0;
              return (
                <button
                  key={m.month}
                  type="button"
                  onClick={() => onSelect(m.month)}
                  aria-pressed={isSelected}
                  aria-label={`${formatMonth(m.month)}: entrou ${formatMoney(m.income.total)}, saiu ${formatMoney(m.expense.total)}`}
                  className={`flex min-w-0 flex-col items-stretch rounded-xl pt-2 pb-1 transition ${crowded ? "px-0" : "px-1"} ${
                    isSelected ? "bg-surface-2" : "hover:bg-surface-2/60"
                  }`}
                >
                  <span className={`flex flex-1 items-end justify-center ${crowded ? "gap-px" : "gap-1"}`} aria-hidden="true">
                    <span
                      className={`rounded-t-sm bg-income ${crowded ? "w-[3px] sm:w-2" : "w-2.5 sm:w-3.5"}`}
                      style={{ height: height(m.income.total) }}
                    />
                    <span
                      className={`rounded-t-sm bg-expense ${crowded ? "w-[3px] sm:w-2" : "w-2.5 sm:w-3.5"}`}
                      style={{ height: height(m.expense.total) }}
                    />
                  </span>
                  <span
                    className={`mt-1.5 overflow-visible text-center font-bold whitespace-nowrap ${crowded ? "text-[10px]" : "text-xs"} ${
                      isSelected ? "text-ink" : "text-muted"
                    } ${showLabel ? "" : "invisible"}`}
                    aria-hidden="true"
                  >
                    {shortMonthName(m.month)}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {!loading && months.length > 0 && <p className="mt-3 border-t border-line pt-3 text-sm text-muted">{footer(average)}</p>}
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
  range,
  emptyWhen,
  type,
  onTypeChange,
}: {
  householdId: string | undefined;
  range: ReportRange;
  /** "em novembro" / "no período" */
  emptyWhen: string;
  type: CategoryType;
  onTypeChange: (type: CategoryType) => void;
}) {
  const { data, isPending } = useSpendingByCategory(householdId, range, type);
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
            Nenhuma {type === "expense" ? "despesa" : "receita"} {emptyWhen}.
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

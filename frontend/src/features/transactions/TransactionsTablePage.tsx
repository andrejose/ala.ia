import { ArrowDown, ArrowUp, ChevronsUpDown, Download, List, Repeat, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { FormError } from "../../components/fields";
import { Money } from "../../components/Money";
import { PageHeader } from "../../components/PageHeader";
import { Badge, Button, Card } from "../../components/ui";
import { api } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { errorMessage, useHouseholdMutation } from "../../lib/mutations";
import { periodPresets } from "../../lib/periods";
import { useAccounts, useCategories, useTransactionSearch, type TransactionSearchParams } from "../../lib/queries";
import type { Account, Category, Transaction, TransactionSearchRow, TransactionType } from "../../lib/types";
import { useHousehold } from "../household/HouseholdProvider";
import { useTransactionSheet } from "./TransactionSheet";

// =============================================================================
// Tabela de lançamentos: filtros por coluna, ordenação, totais do filtro,
// troca de categoria em lote e exportação em CSV. Os filtros ficam no
// endereço (?categoria=...&de=...), para recarregar ou compartilhar a visão.
// A filtragem, a ordem e a paginação acontecem no servidor.
// =============================================================================

const PAGE_SIZE = 50;

type SortColumn = "date" | "description" | "category" | "account" | "amount" | "status";

// Nome no endereço (em português) -> nome do filtro na API
const URL_KEYS = {
  from: "de",
  to: "ate",
  q: "busca",
  type: "tipo",
  category: "categoria",
  account: "conta",
  status: "situacao",
  min: "min",
  max: "max",
} as const;
type FilterKey = keyof typeof URL_KEYS;

const TYPE_OPTIONS: Array<{ value: TransactionType; label: string }> = [
  { value: "expense", label: "Despesa" },
  { value: "income", label: "Receita" },
  { value: "transfer", label: "Transferência" },
];

const COLUMNS: Array<{ key: SortColumn; label: string; align?: "right" }> = [
  { key: "date", label: "Data" },
  { key: "description", label: "Descrição" },
  { key: "category", label: "Categoria" },
  { key: "account", label: "Conta" },
  { key: "amount", label: "Valor", align: "right" },
  { key: "status", label: "Situação" },
];

const listOf = (value: string | null) => (value ? value.split(",").filter(Boolean) : []);

export function TransactionsTablePage() {
  const { household } = useHousehold();
  const sheet = useTransactionSheet();
  const [params, setParams] = useSearchParams();
  const accounts = useAccounts(household?.id);
  const categories = useCategories(household?.id);

  const filters = Object.fromEntries(
    (Object.keys(URL_KEYS) as FilterKey[]).map((key) => [key, params.get(URL_KEYS[key]) ?? ""])
  ) as Record<FilterKey, string>;
  const sort = (params.get("ordem") as SortColumn) || "date";
  const order = params.get("dir") === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(params.get("pagina")) || 1);

  const filterParams: TransactionSearchParams = Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== "")
  );
  const search = useTransactionSearch(household?.id, {
    ...filterParams,
    sort,
    order,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const rows = search.data?.data ?? [];
  const total = search.data?.pagination.total ?? 0;

  // Seleção: as linhas marcadas, ou "todas do filtro"
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const filterKey = JSON.stringify(filterParams);
  useEffect(() => {
    setSelected(new Set());
    setAllMatching(false);
  }, [filterKey]);

  function update(changes: Record<string, string | null>, keepPage = false) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    if (!keepPage) next.delete("pagina");
    setParams(next, { replace: true });
  }

  const setFilter = (key: FilterKey, value: string) => update({ [URL_KEYS[key]]: value });

  function toggleSort(column: SortColumn) {
    const textColumn = column === "description" || column === "category" || column === "account";
    const nextOrder = sort === column ? (order === "asc" ? "desc" : "asc") : textColumn ? "asc" : "desc";
    update({ ordem: column === "date" ? null : column, dir: nextOrder === "desc" ? null : nextOrder });
  }

  const hasFilters = Object.values(filters).some((value) => value !== "");
  const pageIds = rows.map((row) => row.id);
  const pageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const selectionCount = allMatching ? total : selected.size;

  function togglePage() {
    setAllMatching(false);
    setSelected(pageSelected ? new Set() : new Set(pageIds));
  }

  function toggleRow(id: string) {
    setAllMatching(false);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openRow(row: TransactionSearchRow) {
    const transaction: Transaction = {
      id: row.id,
      household_id: household!.id,
      type: row.type,
      description: row.description,
      amount: row.amount,
      account_id: row.account_id,
      destination_account_id: row.destination_account_id,
      category_id: row.category_id,
      due_date: row.due_date,
      payment_date: row.payment_date,
      recurrence_id: row.recurrence_id,
      user_id: null,
    };
    sheet.openEdit(transaction);
  }

  return (
    <>
      <PageHeader
        title="Lançamentos"
        description="Todos os lançamentos em tabela, com filtros e ordenação."
        action={
          <Link
            to="/lancamentos"
            className="inline-flex h-10 items-center gap-2 rounded-2xl bg-primary-soft px-4 text-sm font-bold text-primary transition hover:brightness-95"
          >
            <List className="size-4" aria-hidden="true" />
            Lista
          </Link>
        }
      />

      <Filters
        filters={filters}
        onChange={setFilter}
        onPeriod={(from, to) => update({ de: from, ate: to })}
        onClear={() => setParams({}, { replace: true })}
        hasFilters={hasFilters}
        categories={categories.data ?? []}
        accounts={accounts.data ?? []}
      />

      <TotalsBar
        householdId={household?.id}
        totals={search.data?.totals}
        loading={search.isPending}
        exportParams={{ ...filterParams, sort, order }}
      />

      {selectionCount > 0 && household && (
        <BulkBar
          householdId={household.id}
          count={selectionCount}
          allMatching={allMatching}
          canSelectAll={pageSelected && !allMatching && total > pageIds.length}
          total={total}
          onSelectAll={() => setAllMatching(true)}
          onClear={() => {
            setSelected(new Set());
            setAllMatching(false);
          }}
          onDone={setBulkMessage}
          body={(categoryId) =>
            allMatching ? { category_id: categoryId, filter: filterParams } : { category_id: categoryId, ids: [...selected] }
          }
          categories={(categories.data ?? []).filter((c) => c.is_active)}
        />
      )}

      {bulkMessage && (
        <p role="status" className="mt-4 flex items-start justify-between gap-3 rounded-2xl bg-income-soft px-4 py-3 text-sm text-income">
          {bulkMessage}
          <button type="button" aria-label="Fechar aviso" onClick={() => setBulkMessage(null)}>
            <X className="size-4" aria-hidden="true" />
          </button>
        </p>
      )}

      <Card className="mt-4 overflow-hidden">
        {search.isPending ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} className="block h-10 animate-pulse rounded-xl bg-surface-2" aria-hidden="true" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-muted">
            {hasFilters ? "Nenhum lançamento com esses filtros." : "Nenhum lançamento ainda."}
          </p>
        ) : (
          <>
            {/* Tela larga: tabela */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm" aria-label="Lançamentos">
                <thead className="border-b border-line bg-surface-2/50 text-left">
                  <tr>
                    <th scope="col" className="w-10 px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label="Marcar todos desta página"
                        checked={pageSelected}
                        onChange={togglePage}
                        className="size-4 accent-[var(--primary)]"
                      />
                    </th>
                    {COLUMNS.map((column) => (
                      <SortHeader key={column.key} column={column} sort={sort} order={order} onSort={toggleSort} />
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className={`cursor-pointer transition hover:bg-surface-2/60 ${selected.has(row.id) || allMatching ? "bg-primary-soft/40" : ""}`}
                      onClick={() => openRow(row)}
                    >
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Marcar ${row.description}`}
                          checked={allMatching || selected.has(row.id)}
                          onChange={() => toggleRow(row.id)}
                          className="size-4 accent-[var(--primary)]"
                        />
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap tabular">{formatDate(row.due_date)}</td>
                      <td className="max-w-72 px-3 py-2.5">
                        <span className="flex items-center gap-1.5">
                          <button type="button" className="truncate text-left font-semibold hover:underline" onClick={() => openRow(row)}>
                            {row.description}
                          </button>
                          {row.recurrence_id && <Repeat className="size-3.5 shrink-0 text-muted" role="img" aria-label="Recorrente" />}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-muted">{row.category_name ?? "—"}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-muted">
                        {row.account_name}
                        {row.destination_account_name && ` → ${row.destination_account_name}`}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <RowAmount row={row} />
                      </td>
                      <td className="px-3 py-2.5">
                        <RowStatus row={row} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Celular: cartões */}
            <ul className="divide-y divide-line md:hidden" aria-label="Lançamentos">
              {rows.map((row) => (
                <li key={row.id} className="flex items-start gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label={`Marcar ${row.description}`}
                    checked={allMatching || selected.has(row.id)}
                    onChange={() => toggleRow(row.id)}
                    className="mt-1 size-4 shrink-0 accent-[var(--primary)]"
                  />
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openRow(row)}>
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-semibold">{row.description}</span>
                      <RowAmount row={row} />
                    </span>
                    <span className="block truncate text-sm text-muted">
                      {formatDate(row.due_date)} · {row.category_name ?? "Transferência"} · {row.account_name}
                    </span>
                    {row.status === "pending" && (
                      <span className="mt-1 inline-block">
                        <RowStatus row={row} />
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {total > PAGE_SIZE && (
        <nav className="mt-4 flex items-center justify-between gap-3 text-sm" aria-label="Páginas">
          <span className="text-muted">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} de {total}
          </span>
          <span className="flex gap-2">
            <Button variant="ghost" disabled={page <= 1} onClick={() => update({ pagina: page - 1 > 1 ? String(page - 1) : null }, true)}>
              Anterior
            </Button>
            <Button variant="ghost" disabled={page * PAGE_SIZE >= total} onClick={() => update({ pagina: String(page + 1) }, true)}>
              Próxima
            </Button>
          </span>
        </nav>
      )}

      <p className="mt-6 text-sm text-muted">
        A data é a do vencimento. Toque num lançamento para editar; marque vários para trocar a categoria de uma vez.
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Partes da tabela
// ---------------------------------------------------------------------------
function SortHeader({
  column,
  sort,
  order,
  onSort,
}: {
  column: { key: SortColumn; label: string; align?: "right" };
  sort: SortColumn;
  order: "asc" | "desc";
  onSort: (column: SortColumn) => void;
}) {
  const active = sort === column.key;
  const Icon = !active ? ChevronsUpDown : order === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={active ? (order === "asc" ? "ascending" : "descending") : "none"}
      className={`px-3 py-2 font-bold ${column.align === "right" ? "text-right" : ""}`}
    >
      <button
        type="button"
        onClick={() => onSort(column.key)}
        className={`inline-flex items-center gap-1 transition hover:text-ink ${active ? "text-ink" : "text-muted"}`}
      >
        {column.label}
        <Icon className="size-3.5" aria-hidden="true" />
      </button>
    </th>
  );
}

function RowAmount({ row }: { row: TransactionSearchRow }) {
  const tone = row.type === "income" ? "income" : row.type === "expense" ? "expense" : "neutral";
  return <Money value={row.amount} tone={tone} className="font-bold" />;
}

function RowStatus({ row }: { row: TransactionSearchRow }) {
  if (row.status === "paid") return <span className="text-xs text-muted">Pago</span>;
  return <Badge tone="pending">{row.type === "income" ? "A receber" : row.type === "transfer" ? "Agendada" : "A pagar"}</Badge>;
}

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------
function Filters({
  filters,
  onChange,
  onPeriod,
  onClear,
  hasFilters,
  categories,
  accounts,
}: {
  filters: Record<FilterKey, string>;
  onChange: (key: FilterKey, value: string) => void;
  onPeriod: (from: string, to: string) => void;
  onClear: () => void;
  hasFilters: boolean;
  categories: Category[];
  accounts: Account[];
}) {
  // A busca e os valores só vão para o endereço quando a pessoa para de digitar
  const [q, setQ] = useDebounced(filters.q, (value) => onChange("q", value));
  const [min, setMin] = useDebounced(filters.min, (value) => onChange("min", value));
  const [max, setMax] = useDebounced(filters.max, (value) => onChange("max", value));
  const types = listOf(filters.type);
  const presets = periodPresets();

  const categoryOptions = [
    { value: "none", label: "Sem categoria (transferências)" },
    ...categories
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      .map((c) => ({ value: c.id, label: `${c.name}${c.type === "income" ? " (receita)" : ""}${c.is_active ? "" : " · arquivada"}` })),
  ];
  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name }));

  return (
    <Card className="space-y-4 p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
        <Field label="Descrição" htmlFor="filter-q">
          <input id="filter-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ex.: posto, ifood" className={inputClass} />
        </Field>
        <Field label="De" htmlFor="filter-from">
          <input id="filter-from" type="date" value={filters.from} onChange={(e) => onChange("from", e.target.value)} className={inputClass} />
        </Field>
        <Field label="Até" htmlFor="filter-to">
          <input id="filter-to" type="date" value={filters.to} onChange={(e) => onChange("to", e.target.value)} className={inputClass} />
        </Field>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Atalhos de período">
        {presets.map((preset) => {
          const active = preset.period.from === filters.from && preset.period.to === filters.to;
          return (
            <Chip key={preset.label} active={active} onClick={() => onPeriod(active ? "" : preset.period.from, active ? "" : preset.period.to)}>
              {preset.label}
            </Chip>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MultiSelect label="Categoria" options={categoryOptions} value={listOf(filters.category)} onChange={(v) => onChange("category", v.join(","))} />
        <MultiSelect label="Conta" options={accountOptions} value={listOf(filters.account)} onChange={(v) => onChange("account", v.join(","))} />
        <Field label="Situação" htmlFor="filter-status">
          <select id="filter-status" value={filters.status} onChange={(e) => onChange("status", e.target.value)} className={inputClass}>
            <option value="">Todas</option>
            <option value="paid">Pago</option>
            <option value="pending">A pagar ou a receber</option>
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Valor de" htmlFor="filter-min">
            <input id="filter-min" inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0" className={inputClass} />
          </Field>
          <Field label="até" htmlFor="filter-max">
            <input id="filter-max" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value.replace(/[^\d.]/g, ""))} placeholder="∞" className={inputClass} />
          </Field>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Tipo">
          {TYPE_OPTIONS.map((option) => {
            const active = types.includes(option.value);
            return (
              <Chip
                key={option.value}
                active={active}
                onClick={() =>
                  onChange("type", (active ? types.filter((t) => t !== option.value) : [...types, option.value]).join(","))
                }
              >
                {option.label}
              </Chip>
            );
          })}
        </div>
        {hasFilters && (
          <button type="button" onClick={onClear} className="inline-flex items-center gap-1 text-sm font-bold text-muted hover:text-ink">
            <X className="size-4" aria-hidden="true" />
            Limpar filtros
          </button>
        )}
      </div>
    </Card>
  );
}

const inputClass =
  "h-11 w-full rounded-2xl border border-line bg-surface px-3 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary-soft";

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-bold text-muted">
        {label}
      </label>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`h-9 rounded-full px-4 text-sm font-bold transition ${
        active ? "bg-primary text-primary-ink" : "bg-surface-2 text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

// Lista de opções com marcação múltipla, que abre e fecha
function MultiSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const chosen = options.filter((o) => value.includes(o.value));
  const summary = chosen.length === 0 ? "Todas" : chosen.length === 1 ? chosen[0].label : `${chosen.length} escolhidas`;
  const id = `filter-${label.toLowerCase()}`;

  return (
    <div className="relative">
      <span className="mb-1 block text-xs font-bold text-muted" id={`${id}-label`}>
        {label}
      </span>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        aria-labelledby={`${id}-label ${id}-summary`}
        onClick={() => setOpen((o) => !o)}
        className={`${inputClass} flex items-center justify-between gap-2 text-left`}
      >
        <span id={`${id}-summary`} className={`truncate ${chosen.length ? "text-ink" : "text-muted"}`}>
          {summary}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted" aria-hidden="true" />
      </button>
      {open && (
        <fieldset
          id={`${id}-panel`}
          className="absolute z-20 mt-1 max-h-72 w-full min-w-56 overflow-y-auto rounded-2xl border border-line bg-surface p-2 shadow-card"
        >
          <legend className="sr-only">{label}</legend>
          {options.map((option) => (
            <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-sm hover:bg-surface-2">
              <input
                type="checkbox"
                checked={value.includes(option.value)}
                onChange={(e) => onChange(e.target.checked ? [...value, option.value] : value.filter((v) => v !== option.value))}
                className="size-4 accent-[var(--primary)]"
              />
              <span className="truncate">{option.label}</span>
            </label>
          ))}
          <div className="mt-1 flex justify-between border-t border-line px-2 pt-2">
            <button type="button" className="text-xs font-bold text-muted hover:text-ink" onClick={() => onChange([])}>
              Limpar
            </button>
            <button type="button" className="text-xs font-bold text-primary" onClick={() => setOpen(false)}>
              Fechar
            </button>
          </div>
        </fieldset>
      )}
    </div>
  );
}

// Valor local que só é confirmado 400 ms depois da última tecla
function useDebounced(external: string, commit: (value: string) => void): [string, (value: string) => void] {
  const [value, setValue] = useState(external);
  useEffect(() => setValue(external), [external]);
  useEffect(() => {
    if (value === external) return;
    const timer = setTimeout(() => commit(value), 400);
    return () => clearTimeout(timer);
    // commit muda a cada render; o que importa é o valor digitado
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return [value, setValue];
}

// ---------------------------------------------------------------------------
// Totais do filtro e exportação
// ---------------------------------------------------------------------------
function TotalsBar({
  householdId,
  totals,
  loading,
  exportParams,
}: {
  householdId: string | undefined;
  totals: { count: number; income: number; expense: number; transfer: number } | undefined;
  loading: boolean;
  exportParams: TransactionSearchParams;
}) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function exportCsv() {
    if (!householdId) return;
    setExporting(true);
    setError(null);
    try {
      const file = await api.download(`/households/${householdId}/transactions/export`, exportParams);
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = "lancamentos.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted" role="status" aria-label="Totais do filtro">
        {loading || !totals ? (
          "Carregando…"
        ) : (
          <>
            <strong className="text-ink">
              {totals.count} {totals.count === 1 ? "lançamento" : "lançamentos"}
            </strong>
            {totals.income > 0 && (
              <>
                {" · entrou "}
                <Money value={totals.income} className="font-bold text-income" />
              </>
            )}
            {totals.expense > 0 && (
              <>
                {" · saiu "}
                <Money value={totals.expense} className="font-bold text-expense" />
              </>
            )}
            {totals.transfer > 0 && (
              <>
                {" · transferido "}
                <Money value={totals.transfer} className="font-bold" />
              </>
            )}
          </>
        )}
      </p>
      <Button variant="soft" className="h-9 px-4 text-sm" onClick={exportCsv} disabled={exporting || !totals?.count}>
        <Download className="size-4" aria-hidden="true" />
        {exporting ? "Exportando…" : "Exportar CSV"}
      </Button>
      {error && (
        <div className="w-full">
          <FormError>{error}</FormError>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Troca de categoria em lote
// ---------------------------------------------------------------------------
type RecategorizeBody = { category_id: string; ids: string[] } | { category_id: string; filter: TransactionSearchParams };

function BulkBar({
  householdId,
  count,
  allMatching,
  canSelectAll,
  total,
  onSelectAll,
  onClear,
  onDone,
  body,
  categories,
}: {
  householdId: string;
  count: number;
  allMatching: boolean;
  canSelectAll: boolean;
  total: number;
  onSelectAll: () => void;
  onClear: () => void;
  onDone: (message: string) => void;
  body: (categoryId: string) => RecategorizeBody;
  categories: Category[];
}) {
  const [categoryId, setCategoryId] = useState("");
  const move = useHouseholdMutation(householdId, (payload: RecategorizeBody) =>
    api.post<{ updated: number; skipped: number }>(`/households/${householdId}/transactions/recategorize`, payload)
  );
  const grouped = useMemo(
    () => ({
      expense: categories.filter((c) => c.type === "expense").sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
      income: categories.filter((c) => c.type === "income").sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    }),
    [categories]
  );

  function apply() {
    if (!categoryId) return;
    const name = categories.find((c) => c.id === categoryId)?.name ?? "";
    move.mutate(body(categoryId), {
      onSuccess: ({ updated, skipped }) => {
        onDone(
          `${updated} ${updated === 1 ? "lançamento movido" : "lançamentos movidos"} para ${name}.` +
            (skipped > 0
              ? ` ${skipped} ${skipped === 1 ? "ficou" : "ficaram"} como ${skipped === 1 ? "estava" : "estavam"} (transferência ou tipo diferente da categoria).`
              : "")
        );
        onClear();
      },
    });
  }

  return (
    <Card className="mt-4 flex flex-wrap items-center gap-3 border border-primary/30 p-4">
      <p className="text-sm font-bold">
        {allMatching ? `Todos os ${total} do filtro marcados` : `${count} ${count === 1 ? "marcado" : "marcados"}`}
        {canSelectAll && (
          <button type="button" onClick={onSelectAll} className="ml-2 font-bold text-primary hover:underline">
            Marcar todos os {total} do filtro
          </button>
        )}
      </p>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <label htmlFor="bulk-category" className="sr-only">
          Nova categoria
        </label>
        <select id="bulk-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={`${inputClass} w-56`}>
          <option value="">Mover para a categoria…</option>
          <optgroup label="Despesas">
            {grouped.expense.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Receitas">
            {grouped.income.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </optgroup>
        </select>
        <Button className="h-11 px-4 text-sm" onClick={apply} disabled={!categoryId || move.isPending}>
          {move.isPending ? "Movendo…" : "Mover"}
        </Button>
        <Button variant="ghost" className="h-11 px-3 text-sm" onClick={onClear}>
          Desmarcar
        </Button>
      </div>
      {move.error && (
        <div className="w-full">
          <FormError>{errorMessage(move.error)}</FormError>
        </div>
      )}
    </Card>
  );
}

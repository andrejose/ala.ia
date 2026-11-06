import { ArrowDownLeft, ArrowUpRight, ChevronDown, ChevronRight } from "lucide-react";
import { Link } from "react-router";
import type { ReactNode } from "react";
import { CategoryIcon } from "../../components/CategoryIcon";
import { Money } from "../../components/Money";
import { ProfileMenu } from "../../components/ProfileMenu";
import { ThemeToggle } from "../../components/ThemeToggle";
import { Button, Card, SectionTitle } from "../../components/ui";
import { api } from "../../lib/api";
import { today } from "../../lib/money";
import { useHouseholdMutation } from "../../lib/mutations";
import { firstName, formatMonth, greeting, monthName } from "../../lib/format";
import {
  currentMonth,
  useAccounts,
  useCategories,
  useMonthSummary,
  useRecentTransactions,
  useSpendingByCategory,
} from "../../lib/queries";
import type { Account, Category, ReportSummary, Transaction } from "../../lib/types";
import { accountTypes } from "../accounts/accountTypes";
import { useHousehold } from "../household/HouseholdProvider";
import { ReceivedInvitations } from "../household/ReceivedInvitations";
import { TransactionRow } from "../transactions/TransactionRow";
import { useTransactionSheet } from "../transactions/TransactionSheet";

export function DashboardPage() {
  const { me, household, isLoading, error } = useHousehold();

  if (error) return <LoadError />;
  if (isLoading || !me || !household) return <DashboardSkeleton />;

  return (
    <div className="space-y-6">
      <Header />
      <ReceivedInvitations />
      {/* minmax(0, ...) impede que o carrossel de contas estique a coluna */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <BalanceHero householdId={household.id} />
          <MonthSummary householdId={household.id} />
          <RecentTransactions householdId={household.id} />
        </div>
        <div className="min-w-0 space-y-6">
          <SpendingByCategory householdId={household.id} />
          <AccountsList householdId={household.id} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cabeçalho: saudação, household em uso e perfil
// ---------------------------------------------------------------------------
function Header() {
  const { me, household, households, selectHousehold } = useHousehold();
  if (!me || !household) return null;

  return (
    <header className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-muted">{greeting()},</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight">{firstName(me.name)}</h1>

        {households.length > 1 ? (
          <label className="relative mt-2 inline-flex max-w-full items-center">
            <span className="sr-only">Household em uso</span>
            <select
              value={household.id}
              onChange={(event) => selectHousehold(event.target.value)}
              className="max-w-full appearance-none truncate rounded-full bg-surface-2 py-1 pr-8 pl-3 text-sm font-semibold text-muted outline-none hover:text-ink"
            >
              {households.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 size-4 text-muted" aria-hidden="true" />
          </label>
        ) : (
          <p className="mt-2 inline-flex rounded-full bg-surface-2 px-3 py-1 text-sm font-semibold text-muted">
            {household.name}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1">
        <span className="lg:hidden">
          <ThemeToggle />
        </span>
        <ProfileMenu name={me.name} email={me.email} />
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Saldo total e frase sobre o mês
// ---------------------------------------------------------------------------
function monthSentence(summary: ReportSummary | undefined) {
  if (!summary) return null;
  const month = monthName(summary.month);
  const { income, expense, balance } = summary;

  if (income.paid === 0 && expense.paid === 0) {
    return <>Nada entrou nem saiu em {month} ainda. Quando lançar, você vê aqui como o mês está indo.</>;
  }
  if (balance.paid >= 0) {
    return (
      <>
        Em {month}, sobraram{" "}
        <strong className="font-extrabold">
          <Money value={balance.paid} className="text-primary-ink" />
        </strong>{" "}
        do que entrou até agora.
      </>
    );
  }
  return (
    <>
      Em {month}, saíram{" "}
      <strong className="font-extrabold">
        <Money value={-balance.paid} className="text-primary-ink" />
      </strong>{" "}
      a mais do que entrou. Vale olhar para onde foi.
    </>
  );
}

function BalanceHero({ householdId }: { householdId: string }) {
  const accounts = useAccounts(householdId);
  const summary = useMonthSummary(householdId);
  const total = (accounts.data ?? []).filter((a) => a.is_active).reduce((sum, a) => sum + a.current_balance, 0);

  return (
    <section className="relative overflow-hidden rounded-card bg-primary p-6 text-primary-ink shadow-card">
      {/* Asa do logo, grande e suave, como ilustração de fundo */}
      <svg viewBox="0 0 64 64" className="pointer-events-none absolute -right-6 -bottom-10 size-48 opacity-20" aria-hidden="true">
        <path d="M14 42c10-1 20-7 26-18 2 9-1 18-9 22" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <path d="M22 47c9 0 18-3 26-12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>

      <p className="text-sm font-semibold opacity-80">Saldo em todas as contas</p>
      <p className="mt-1 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
        {accounts.isLoading ? (
          <span className="inline-block h-12 w-56 animate-pulse rounded-xl bg-primary-ink/15" />
        ) : (
          <Money value={total} className="text-primary-ink" />
        )}
      </p>
      <p className="mt-4 max-w-xs text-sm leading-relaxed opacity-90">{monthSentence(summary.data)}</p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Entrou x saiu no mês
// ---------------------------------------------------------------------------
function MonthSummary({ householdId }: { householdId: string }) {
  const { data: summary, isLoading } = useMonthSummary(householdId);
  const spentShare = summary && summary.income.paid > 0 ? Math.round((summary.expense.paid / summary.income.paid) * 100) : null;

  return (
    <section aria-labelledby="month-title">
      <SectionTitle>
        <span id="month-title">{formatMonth(currentMonth())}</span>
      </SectionTitle>

      <div className="grid grid-cols-2 gap-3">
        <SummaryTile
          label="Entrou"
          icon={<ArrowDownLeft className="size-4" aria-hidden="true" />}
          tone="income"
          value={summary?.income.paid}
          pending={summary?.income.pending}
          pendingLabel="a receber"
          loading={isLoading}
        />
        <SummaryTile
          label="Saiu"
          icon={<ArrowUpRight className="size-4" aria-hidden="true" />}
          tone="expense"
          value={summary?.expense.paid}
          pending={summary?.expense.pending}
          pendingLabel="a pagar"
          loading={isLoading}
        />
      </div>

      {spentShare !== null && (
        <Card className="mt-3 p-4">
          <p className="text-sm font-semibold">Você usou {spentShare}% do que recebeu</p>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-2" role="presentation">
            <div
              className={`h-full rounded-full ${spentShare > 100 ? "bg-expense" : "bg-primary"}`}
              style={{ width: `${Math.min(spentShare, 100)}%` }}
            />
          </div>
        </Card>
      )}
    </section>
  );
}

function SummaryTile({
  label,
  icon,
  tone,
  value,
  pending,
  pendingLabel,
  loading,
}: {
  label: string;
  icon: ReactNode;
  tone: "income" | "expense";
  value: number | undefined;
  pending: number | undefined;
  pendingLabel: string;
  loading: boolean;
}) {
  const soft = tone === "income" ? "bg-income-soft text-income" : "bg-expense-soft text-expense";
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-sm font-bold text-muted">
        <span className={`grid size-7 place-items-center rounded-full ${soft}`}>{icon}</span>
        {label}
      </div>
      <p className="mt-2 font-display text-xl font-semibold sm:text-2xl">
        {loading ? <Skeleton className="h-7 w-28" /> : <Money value={value ?? 0} />}
      </p>
      {!!pending && pending > 0 && (
        <p className="mt-1 text-xs font-semibold text-pending">
          + <Money value={pending} className="text-pending" /> {pendingLabel}
        </p>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Gastos por categoria
// ---------------------------------------------------------------------------
function SpendingByCategory({ householdId }: { householdId: string }) {
  const { data, isLoading } = useSpendingByCategory(householdId);

  return (
    <section aria-labelledby="spending-title">
      <SectionTitle>
        <span id="spending-title">Para onde foi o dinheiro</span>
      </SectionTitle>
      <Card className="space-y-4 p-5">
        {isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-full" />)}

        {data && data.categories.length === 0 && (
          <p className="text-sm text-muted">Nenhuma despesa em {monthName(data.month)} ainda.</p>
        )}

        {data?.categories.map((c) => {
          const share = data.total > 0 ? (c.total / data.total) * 100 : 0;
          return (
            <div key={c.category_id} className="flex items-center gap-3">
              <CategoryIcon icon={c.icon} color={c.color} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate font-semibold">{c.name}</span>
                  <Money value={c.total} className="font-bold" />
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2" role="presentation">
                  <div
                    className="h-full rounded-full bg-muted"
                    style={{ width: `${share}%`, backgroundColor: c.color ?? undefined }}
                  />
                </div>
              </div>
              <span className="w-10 text-right text-xs font-bold text-muted tabular">{Math.round(share)}%</span>
            </div>
          );
        })}
      </Card>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Contas
// ---------------------------------------------------------------------------
function AccountsList({ householdId }: { householdId: string }) {
  const { data, isLoading } = useAccounts(householdId);
  const accounts = (data ?? []).filter((a) => a.is_active);

  return (
    <section aria-labelledby="accounts-title">
      <SectionTitle action={accounts.length > 0 ? <LinkMore to="/contas">Todas</LinkMore> : undefined}>
        <span id="accounts-title">Suas contas</span>
      </SectionTitle>

      {isLoading && <Skeleton className="h-24 w-full" />}

      {data && accounts.length === 0 && (
        <Card className="p-5">
          <p className="font-semibold">Nenhuma conta cadastrada.</p>
          <p className="mt-1 text-sm text-muted">
            Comece pela conta do banco ou pela carteira: o saldo de cada uma aparece aqui.
          </p>
          <Link to="/contas" className="mt-3 inline-flex text-sm font-bold text-primary hover:underline">
            Cadastrar conta
          </Link>
        </Card>
      )}

      {accounts.length > 0 && (
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 lg:flex-col lg:overflow-visible">
          {accounts.map((account) => {
            const Icon = accountTypes[account.type].icon;
            return (
              <Card key={account.id} className="min-w-[180px] snap-start p-4 lg:flex lg:items-center lg:gap-3">
                <span className="grid size-10 place-items-center rounded-2xl bg-primary-soft text-primary">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <div className="mt-3 lg:mt-0 lg:flex-1">
                  <p className="text-sm font-semibold text-muted">{account.name}</p>
                  <p className="font-display text-lg font-semibold">
                    <Money value={account.current_balance} />
                  </p>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Últimos lançamentos
// ---------------------------------------------------------------------------
function RecentTransactions({ householdId }: { householdId: string }) {
  const transactions = useRecentTransactions(householdId);
  const categories = useCategories(householdId);
  const accounts = useAccounts(householdId);
  const sheet = useTransactionSheet();
  const markPaid = useHouseholdMutation(householdId, (tx: Transaction) =>
    api.patch(`/households/${householdId}/transactions/${tx.id}`, { payment_date: today() })
  );

  const categoryById = new Map<string, Category>((categories.data ?? []).map((c) => [c.id, c]));
  const accountById = new Map<string, Account>((accounts.data ?? []).map((a) => [a.id, a]));
  const items = transactions.data?.data ?? [];

  return (
    <section aria-labelledby="recent-title">
      <SectionTitle action={items.length > 0 ? <LinkMore to="/lancamentos">Ver todos</LinkMore> : undefined}>
        <span id="recent-title">Últimos lançamentos</span>
      </SectionTitle>

      <Card className="divide-y divide-line">
        {transactions.isLoading &&
          [0, 1, 2].map((i) => (
            <div key={i} className="px-4 py-3.5">
              <Skeleton className="h-10 w-full" />
            </div>
          ))}

        {transactions.data && items.length === 0 && (
          <div className="px-4 py-5">
            <p className="text-sm text-muted">Nenhum lançamento ainda. Registre a primeira receita ou despesa.</p>
            <Button variant="soft" className="mt-3 h-10 text-sm" onClick={() => sheet.openNew()}>
              Novo lançamento
            </Button>
          </div>
        )}

        {items.map((tx) => (
          <TransactionRow
            key={tx.id}
            transaction={tx}
            category={tx.category_id ? categoryById.get(tx.category_id) : undefined}
            accountById={accountById}
            onOpen={() => sheet.openEdit(tx)}
            onMarkPaid={() => markPaid.mutate(tx)}
          />
        ))}
      </Card>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Auxiliares
// ---------------------------------------------------------------------------
function LinkMore({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex items-center text-sm font-bold text-primary hover:underline">
      {children}
      <ChevronRight className="size-4" aria-hidden="true" />
    </Link>
  );
}

function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`block animate-pulse rounded-xl bg-surface-2 ${className}`} aria-hidden="true" />;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Carregando o painel">
      <Skeleton className="h-16 w-48" />
      <Skeleton className="h-44 w-full rounded-card" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-28 rounded-card" />
        <Skeleton className="h-28 rounded-card" />
      </div>
    </div>
  );
}

function LoadError() {
  return (
    <Card className="mx-auto mt-10 max-w-md p-6 text-center">
      <p className="font-display text-xl font-semibold">Não foi possível carregar o painel</p>
      <p className="mt-2 text-muted">Confira se a API está rodando e tente de novo.</p>
      <Button className="mt-5" onClick={() => window.location.reload()}>
        Tentar de novo
      </Button>
    </Card>
  );
}

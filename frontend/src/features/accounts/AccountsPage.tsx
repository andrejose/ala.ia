import { ChevronRight, Plus } from "lucide-react";
import { useState } from "react";
import { Money } from "../../components/Money";
import { PageHeader } from "../../components/PageHeader";
import { Button, Card } from "../../components/ui";
import { useAccounts } from "../../lib/queries";
import type { Account } from "../../lib/types";
import { useHousehold } from "../household/HouseholdProvider";
import { AccountSheet } from "./AccountSheet";
import { accountTypes } from "./accountTypes";

export function AccountsPage() {
  const { household } = useHousehold();
  const { data, isLoading } = useAccounts(household?.id);
  const [editing, setEditing] = useState<Account | "new" | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const active = (data ?? []).filter((a) => a.is_active);
  const archived = (data ?? []).filter((a) => !a.is_active);
  const total = active.reduce((sum, a) => sum + a.current_balance, 0);

  return (
    <>
      <PageHeader
        title="Contas"
        description={
          active.length > 0 ? (
            <>
              Somando tudo, você tem <Money value={total} className="font-bold text-ink" />.
            </>
          ) : undefined
        }
        action={
          <Button onClick={() => setEditing("new")} className="h-10 px-4 text-sm">
            <Plus className="size-4" aria-hidden="true" />
            Nova conta
          </Button>
        }
      />

      {isLoading && <Card className="h-40 animate-pulse" />}

      {data && data.length === 0 && (
        <Card className="p-6">
          <p className="font-display text-xl font-semibold">Comece pela sua primeira conta</p>
          <p className="mt-2 max-w-prose text-muted">
            Cadastre onde o seu dinheiro fica: a conta do banco, a poupança, a carteira. Cada lançamento sai de
            ou entra em uma delas, e o saldo é calculado sozinho.
          </p>
          <Button className="mt-5" onClick={() => setEditing("new")}>
            Cadastrar conta
          </Button>
        </Card>
      )}

      {active.length > 0 && <AccountRows accounts={active} onSelect={setEditing} />}

      {archived.length > 0 && (
        <section className="mt-8">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            aria-expanded={showArchived}
            className="text-sm font-bold text-muted hover:text-ink"
          >
            {showArchived ? "Esconder" : "Mostrar"} contas arquivadas ({archived.length})
          </button>
          {showArchived && (
            <div className="mt-3 opacity-80">
              <AccountRows accounts={archived} onSelect={setEditing} />
            </div>
          )}
        </section>
      )}

      {household && (
        <AccountSheet
          householdId={household.id}
          account={editing && editing !== "new" ? editing : undefined}
          open={editing !== null}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function AccountRows({ accounts, onSelect }: { accounts: Account[]; onSelect: (account: Account) => void }) {
  return (
    <Card className="divide-y divide-line overflow-hidden">
      {accounts.map((account) => {
        const { icon: Icon, label } = accountTypes[account.type];
        return (
          <button
            key={account.id}
            type="button"
            onClick={() => onSelect(account)}
            className="flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-surface-2/60"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{account.name}</span>
              <span className="block text-sm text-muted">{label}</span>
            </span>
            <Money value={account.current_balance} className="font-display text-lg font-semibold" />
            <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
          </button>
        );
      })}
    </Card>
  );
}

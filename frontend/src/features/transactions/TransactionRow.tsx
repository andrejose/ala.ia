import { ArrowLeftRight, Check } from "lucide-react";
import { CategoryIcon } from "../../components/CategoryIcon";
import { Money } from "../../components/Money";
import { Badge } from "../../components/ui";
import { formatShortDate } from "../../lib/format";
import type { Account, Category, Transaction } from "../../lib/types";

// Linha de lançamento usada no painel e na lista de lançamentos
export function TransactionRow({
  transaction: tx,
  category,
  accountById,
  onOpen,
  onMarkPaid,
  showDate = true,
}: {
  transaction: Transaction;
  category?: Category;
  accountById: Map<string, Account>;
  onOpen?: () => void;
  onMarkPaid?: () => void;
  showDate?: boolean;
}) {
  const isTransfer = tx.type === "transfer";
  const subtitle = isTransfer
    ? `${accountById.get(tx.account_id)?.name ?? "Conta"} para ${accountById.get(tx.destination_account_id ?? "")?.name ?? "outra conta"}`
    : [category?.name, accountById.get(tx.account_id)?.name].filter(Boolean).join(", ");
  const pending = !tx.payment_date;

  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        {isTransfer ? (
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-2 text-muted" aria-hidden="true">
            <ArrowLeftRight className="size-5" />
          </span>
        ) : (
          <CategoryIcon icon={category?.icon ?? null} color={category?.color ?? null} />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{tx.description}</span>
          <span className="block truncate text-sm text-muted">{subtitle}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <Money
            value={tx.amount}
            tone={tx.type === "income" ? "income" : tx.type === "expense" ? "expense" : "neutral"}
            className="font-bold"
          />
          {pending ? (
            <Badge tone="pending">Vence {formatShortDate(tx.due_date)}</Badge>
          ) : (
            showDate && <span className="text-xs text-muted">{formatShortDate(tx.payment_date!)}</span>
          )}
        </span>
      </button>

      {pending && onMarkPaid && (
        <button
          type="button"
          onClick={onMarkPaid}
          title={tx.type === "income" ? "Marcar como recebido hoje" : "Marcar como pago hoje"}
          aria-label={`${tx.type === "income" ? "Marcar como recebido" : "Marcar como pago"}: ${tx.description}`}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-pending-soft text-pending transition hover:brightness-95"
        >
          <Check className="size-5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

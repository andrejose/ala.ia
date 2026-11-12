import { CreditCard, Landmark, PiggyBank, TrendingUp, Wallet, type LucideIcon } from "lucide-react";
import type { Account, AccountType } from "../../lib/types";

export const accountTypes: Record<AccountType, { label: string; icon: LucideIcon }> = {
  checking: { label: "Conta corrente", icon: Landmark },
  savings: { label: "Poupança", icon: PiggyBank },
  investment: { label: "Investimento", icon: TrendingUp },
  cash: { label: "Dinheiro", icon: Wallet },
  credit_card: { label: "Cartão de crédito", icon: CreditCard },
};

// No cartão, o saldo negativo é o que se deve: a fatura em aberto
export function isCreditCard(account: Pick<Account, "type">) {
  return account.type === "credit_card";
}

export function openInvoice(account: Account) {
  return isCreditCard(account) && account.current_balance < 0 ? -account.current_balance : 0;
}

// Legenda e valor a mostrar no lugar do saldo
export function balanceDisplay(account: Account): { caption?: string; value: number } {
  if (!isCreditCard(account)) return { value: account.current_balance };
  if (account.current_balance < 0) return { caption: "Fatura em aberto", value: -account.current_balance };
  if (account.current_balance > 0) return { caption: "Crédito no cartão", value: account.current_balance };
  return { caption: "Fatura paga", value: 0 };
}

import { Landmark, PiggyBank, TrendingUp, Wallet, type LucideIcon } from "lucide-react";
import type { AccountType } from "../../lib/types";

export const accountTypes: Record<AccountType, { label: string; icon: LucideIcon }> = {
  checking: { label: "Conta corrente", icon: Landmark },
  savings: { label: "Poupança", icon: PiggyBank },
  investment: { label: "Investimento", icon: TrendingUp },
  cash: { label: "Dinheiro", icon: Wallet },
};

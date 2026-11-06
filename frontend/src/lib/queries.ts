import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { Account, Category, Me, ReportByCategory, ReportSummary, TransactionList } from "./types";

// Consultas à API com cache (TanStack Query). As chaves começam pelo
// household, para a troca de household recarregar tudo dele.

export function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => api.get<Me>("/me") });
}

export function useAccounts(householdId: string | undefined) {
  return useQuery({
    queryKey: ["households", householdId, "accounts"],
    queryFn: () => api.get<Account[]>(`/households/${householdId}/accounts`),
    enabled: !!householdId,
  });
}

export function useCategories(householdId: string | undefined) {
  return useQuery({
    queryKey: ["households", householdId, "categories"],
    queryFn: () => api.get<Category[]>(`/households/${householdId}/categories`),
    enabled: !!householdId,
  });
}

export function useRecentTransactions(householdId: string | undefined, limit = 6) {
  return useQuery({
    queryKey: ["households", householdId, "transactions", { limit }],
    queryFn: () => api.get<TransactionList>(`/households/${householdId}/transactions`, { limit }),
    enabled: !!householdId,
  });
}

export function useMonthSummary(householdId: string | undefined, month = currentMonth()) {
  return useQuery({
    queryKey: ["households", householdId, "reports", "summary", month],
    queryFn: () => api.get<ReportSummary>(`/households/${householdId}/reports/summary`, { month }),
    enabled: !!householdId,
  });
}

export function useSpendingByCategory(householdId: string | undefined, month = currentMonth()) {
  return useQuery({
    queryKey: ["households", householdId, "reports", "by-category", month],
    queryFn: () =>
      api.get<ReportByCategory>(`/households/${householdId}/reports/by-category`, { month, type: "expense" }),
    enabled: !!householdId,
  });
}

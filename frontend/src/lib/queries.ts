import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
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

export interface TransactionFilters {
  from?: string;
  to?: string;
  type?: "income" | "expense" | "transfer";
  status?: "paid" | "pending";
  account_id?: string;
}

const PAGE_SIZE = 30;

// Lista paginada ("carregar mais") com os filtros da API
export function useTransactions(householdId: string | undefined, filters: TransactionFilters) {
  return useInfiniteQuery({
    queryKey: ["households", householdId, "transactions", "list", filters],
    queryFn: ({ pageParam }) =>
      api.get<TransactionList>(`/households/${householdId}/transactions`, { ...filters, limit: PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last) => {
      const next = last.pagination.offset + last.pagination.limit;
      return next < last.pagination.total ? next : undefined;
    },
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

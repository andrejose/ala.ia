import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type {
  Account,
  Category,
  CategoryType,
  Invitation,
  Me,
  Member,
  MyInvitation,
  ReportByCategory,
  ReportMonthly,
  ReportSummary,
  Recurrence,
  TransactionList,
} from "./types";

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

export function useSpendingByCategory(
  householdId: string | undefined,
  month = currentMonth(),
  type: CategoryType = "expense"
) {
  return useQuery({
    queryKey: ["households", householdId, "reports", "by-category", month, type],
    queryFn: () => api.get<ReportByCategory>(`/households/${householdId}/reports/by-category`, { month, type }),
    enabled: !!householdId,
  });
}

// Resumo de cada mês, de `from` a `to` (YYYY-MM)
export function useMonthlySeries(householdId: string | undefined, from: string, to: string) {
  return useQuery({
    queryKey: ["households", householdId, "reports", "monthly", from, to],
    queryFn: () => api.get<ReportMonthly>(`/households/${householdId}/reports/monthly`, { from, to }),
    enabled: !!householdId,
    // Ao trocar de mês, mantém o gráfico anterior até o novo chegar (sem piscar)
    placeholderData: keepPreviousData,
  });
}

export function useMembers(householdId: string | undefined) {
  return useQuery({
    queryKey: ["households", householdId, "members"],
    queryFn: () => api.get<Member[]>(`/households/${householdId}/members`),
    enabled: !!householdId,
  });
}

export function useHouseholdInvitations(householdId: string | undefined) {
  return useQuery({
    queryKey: ["households", householdId, "invitations"],
    queryFn: () => api.get<Invitation[]>(`/households/${householdId}/invitations`),
    enabled: !!householdId,
  });
}

// Convites recebidos pelo usuário logado
export function useMyInvitations() {
  return useQuery({ queryKey: ["invitations"], queryFn: () => api.get<MyInvitation[]>("/invitations") });
}

export function useRecurrences(householdId: string | undefined) {
  return useQuery({
    queryKey: ["households", householdId, "recurrences"],
    queryFn: () => api.get<Recurrence[]>(`/households/${householdId}/recurrences`),
    enabled: !!householdId,
  });
}

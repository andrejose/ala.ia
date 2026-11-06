import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "./api";

// Mutação de dados do household: ao terminar, recarrega tudo dele
// (contas, saldos, lançamentos e relatórios dependem uns dos outros).
export function useHouseholdMutation<TVariables, TResult = unknown>(
  householdId: string | undefined,
  mutationFn: (variables: TVariables) => Promise<TResult>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["households", householdId] }),
  });
}

// Mensagem para mostrar no formulário a partir de um erro da API
export function errorMessage(error: unknown, overrides: Record<string, string> = {}): string | null {
  if (!error) return null;
  if (error instanceof ApiError) {
    if (overrides[error.code]) return overrides[error.code];
    if (error.code === "VALIDATION_ERROR") return "Confira os campos destacados.";
    return error.message;
  }
  return "Algo deu errado. Tente de novo.";
}

export function fieldErrors(error: unknown): Record<string, string> {
  return error instanceof ApiError ? error.fieldErrors : {};
}

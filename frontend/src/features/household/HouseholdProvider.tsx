import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../../lib/api";
import { useMe } from "../../lib/queries";
import type { Household, Me } from "../../lib/types";

// Household em uso. A escolha fica salva no navegador; sem escolha (ou se o
// usuário saiu daquele household), usa o primeiro da lista: o pessoal.

const STORAGE_KEY = "ala.household";

interface HouseholdContextValue {
  me: Me | undefined;
  household: Household | undefined;
  households: Household[];
  selectHousehold: (id: string) => void;
  isLoading: boolean;
  error: unknown;
}

const HouseholdContext = createContext<HouseholdContextValue | null>(null);

function readSaved() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { data: me, isLoading, error } = useMe();
  const [selectedId, setSelectedId] = useState<string | null>(readSaved);

  const households = useMemo(() => me?.households ?? [], [me]);
  const household = households.find((h) => h.id === selectedId) ?? households[0];

  useEffect(() => {
    try {
      if (household) localStorage.setItem(STORAGE_KEY, household.id);
    } catch {
      // ignora: a escolha vale só para esta visita
    }
  }, [household]);

  useMaterializeRecurrences(household?.id);

  const value = useMemo(
    () => ({ me, household, households, selectHousehold: setSelectedId, isLoading, error }),
    [me, household, households, isLoading, error]
  );
  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>;
}

export function useHousehold() {
  const context = useContext(HouseholdContext);
  if (!context) throw new Error("useHousehold precisa estar dentro de <HouseholdProvider>");
  return context;
}

// Ao abrir um household, gera os lançamentos recorrentes que faltam (os do mês
// que virou, por exemplo). Uma vez por household a cada visita; se algo foi
// criado, recarrega os dados dele.
function useMaterializeRecurrences(householdId: string | undefined) {
  const queryClient = useQueryClient();
  const done = useRef(new Set<string>());

  useEffect(() => {
    if (!householdId || done.current.has(householdId)) return;
    done.current.add(householdId);
    api
      .post<{ generated: number }>(`/households/${householdId}/recurrences/materialize`)
      .then(({ generated }) => {
        if (generated > 0) return queryClient.invalidateQueries({ queryKey: ["households", householdId] });
      })
      .catch(() => {
        // sem rede ou API fora: tenta de novo na próxima visita
        done.current.delete(householdId);
      });
  }, [householdId, queryClient]);
}

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
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

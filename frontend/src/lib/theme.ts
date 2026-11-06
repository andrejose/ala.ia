import { useCallback, useEffect, useState } from "react";

export type ThemeChoice = "system" | "light" | "dark";

const STORAGE_KEY = "ala.theme";

function readChoice(): ThemeChoice {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // localStorage indisponível (modo privado, por exemplo): segue o sistema
  }
  return "system";
}

function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") delete root.dataset.theme;
  else root.dataset.theme = choice;
}

// Tema da interface: segue o sistema por padrão, com escolha manual salva no navegador
export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(readChoice);

  useEffect(() => {
    apply(choice);
    try {
      if (choice === "system") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      // ignora: a escolha vale só para esta visita
    }
  }, [choice]);

  const cycle = useCallback(() => {
    setChoice((current) => (current === "system" ? "light" : current === "light" ? "dark" : "system"));
  }, []);

  return { choice, setChoice, cycle };
}

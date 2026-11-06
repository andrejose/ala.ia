import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "../lib/theme";

const labels = {
  system: { icon: Monitor, text: "Tema do sistema" },
  light: { icon: Sun, text: "Tema claro" },
  dark: { icon: Moon, text: "Tema escuro" },
} as const;

// Alterna entre sistema → claro → escuro
export function ThemeToggle({ showLabel = false }: { showLabel?: boolean }) {
  const { choice, cycle } = useTheme();
  const { icon: Icon, text } = labels[choice];

  return (
    <button
      type="button"
      onClick={cycle}
      title={`${text} (clique para trocar)`}
      aria-label={`${text}. Clique para trocar o tema.`}
      className="inline-flex items-center gap-2 rounded-full p-2 text-muted transition hover:bg-surface-2 hover:text-ink"
    >
      <Icon className="size-5" aria-hidden="true" />
      {showLabel && <span className="text-sm font-semibold">{text}</span>}
    </button>
  );
}

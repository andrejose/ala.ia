import { ChevronRight, LogOut, Tags } from "lucide-react";
import { Link } from "react-router";
import { PageHeader } from "../../components/PageHeader";
import { ThemeToggle } from "../../components/ThemeToggle";
import { Card } from "../../components/ui";
import { useAuth } from "../auth/AuthProvider";
import { useHousehold } from "../household/HouseholdProvider";

// "Mais" no celular: o que não cabe na barra inferior
export function MorePage() {
  const { me } = useHousehold();
  const { logout } = useAuth();

  return (
    <>
      <PageHeader title="Mais" description={me ? `${me.name}, ${me.email}` : undefined} />

      <Card className="divide-y divide-line overflow-hidden">
        <Link to="/categorias" className="flex items-center gap-3 px-4 py-4 font-semibold transition hover:bg-surface-2/60">
          <Tags className="size-5 text-primary" aria-hidden="true" />
          <span className="flex-1">Categorias</span>
          <ChevronRight className="size-4 text-muted" aria-hidden="true" />
        </Link>
        <div className="flex items-center gap-3 px-4 py-2.5">
          <span className="flex-1 font-semibold">Aparência</span>
          <ThemeToggle showLabel />
        </div>
        <button
          type="button"
          onClick={() => logout()}
          className="flex w-full items-center gap-3 px-4 py-4 text-left font-semibold text-expense transition hover:bg-surface-2/60"
        >
          <LogOut className="size-5" aria-hidden="true" />
          Sair
        </button>
      </Card>
    </>
  );
}

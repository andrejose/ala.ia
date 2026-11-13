import { ChartPie, ChevronRight, FileUp, LogOut, Repeat, Tags, Users } from "lucide-react";
import { Link } from "react-router";
import { PageHeader } from "../../components/PageHeader";
import { ThemeToggle } from "../../components/ThemeToggle";
import { Card, SectionTitle } from "../../components/ui";
import { useAuth } from "../auth/AuthProvider";
import { useHousehold } from "../household/HouseholdProvider";
import { ProfileNameForm } from "./ProfileNameForm";

// Perfil e o que não cabe na barra inferior do celular
export function MorePage() {
  const { me } = useHousehold();
  const { logout } = useAuth();

  return (
    <>
      <PageHeader title="Perfil" description={me?.email} />

      <div className="space-y-8">
        {me && (
          <Card className="p-5">
            {/* key pelo id: o aviso "Nome salvo" não some quando o nome atualiza */}
            <ProfileNameForm key={me.id} currentName={me.name} />
          </Card>
        )}

        <section aria-labelledby="more-title">
          <SectionTitle>
            <span id="more-title">Mais</span>
          </SectionTitle>
          <Card className="divide-y divide-line overflow-hidden">
            <Link to="/relatorios" className="flex items-center gap-3 px-4 py-4 font-semibold transition hover:bg-surface-2/60">
              <ChartPie className="size-5 text-primary" aria-hidden="true" />
              <span className="flex-1">Relatórios</span>
              <ChevronRight className="size-4 text-muted" aria-hidden="true" />
            </Link>
            <Link to="/recorrentes" className="flex items-center gap-3 px-4 py-4 font-semibold transition hover:bg-surface-2/60">
              <Repeat className="size-5 text-primary" aria-hidden="true" />
              <span className="flex-1">Recorrentes</span>
              <ChevronRight className="size-4 text-muted" aria-hidden="true" />
            </Link>
            <Link to="/importar" className="flex items-center gap-3 px-4 py-4 font-semibold transition hover:bg-surface-2/60">
              <FileUp className="size-5 text-primary" aria-hidden="true" />
              <span className="flex-1">Importar extrato</span>
              <ChevronRight className="size-4 text-muted" aria-hidden="true" />
            </Link>
            <Link to="/espaco" className="flex items-center gap-3 px-4 py-4 font-semibold transition hover:bg-surface-2/60">
              <Users className="size-5 text-primary" aria-hidden="true" />
              <span className="flex-1">Espaço e convites</span>
              <ChevronRight className="size-4 text-muted" aria-hidden="true" />
            </Link>
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
        </section>
      </div>
    </>
  );
}

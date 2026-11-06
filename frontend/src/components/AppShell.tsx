import { ArrowLeftRight, Ellipsis, LayoutDashboard, Plus, Tags, UserRound, Users, Wallet, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink } from "react-router";
import { useTransactionSheet } from "../features/transactions/TransactionSheet";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const mainNav: NavItem[] = [
  { to: "/", label: "Painel", icon: LayoutDashboard },
  { to: "/lancamentos", label: "Lançamentos", icon: ArrowLeftRight },
  { to: "/contas", label: "Contas", icon: Wallet },
];

const moreNav: NavItem[] = [
  { to: "/categorias", label: "Categorias", icon: Tags },
  { to: "/espaco", label: "Espaço", icon: Users },
  { to: "/mais", label: "Perfil", icon: UserRound },
];

// Estrutura das telas logadas:
//   celular    -> conteúdo + barra inferior com botão "+" no centro
//   computador -> barra lateral + conteúdo
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="lg:grid lg:min-h-dvh lg:grid-cols-[260px_1fr]">
      <Sidebar />
      <main className="mx-auto w-full max-w-5xl px-4 pt-4 pb-32 sm:px-6 lg:px-10 lg:pt-8 lg:pb-12">{children}</main>
      <BottomNav />
    </div>
  );
}

function Sidebar() {
  const sheet = useTransactionSheet();
  return (
    <aside className="sticky top-0 hidden h-dvh flex-col gap-8 border-r border-line bg-surface/60 px-5 py-7 lg:flex">
      <div className="px-2">
        <Logo />
      </div>

      <button
        type="button"
        onClick={() => sheet.openNew()}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-primary font-bold text-primary-ink shadow-card transition hover:brightness-110"
      >
        <Plus className="size-5" aria-hidden="true" />
        Novo lançamento
      </button>

      <nav aria-label="Principal" className="flex flex-col gap-1">
        {[...mainNav, ...moreNav].map((item) => (
          <SidebarLink key={item.to} {...item} />
        ))}
      </nav>

      <div className="mt-auto flex items-center justify-between px-2">
        <span className="text-sm text-muted">Aparência</span>
        <ThemeToggle />
      </div>
    </aside>
  );
}

function SidebarLink({ to, label, icon: Icon }: NavItem) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-2xl px-3 py-2.5 font-semibold transition ${
          isActive ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-2 hover:text-ink"
        }`
      }
    >
      <Icon className="size-5" aria-hidden="true" />
      {label}
    </NavLink>
  );
}

function BottomNav() {
  const sheet = useTransactionSheet();
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      <div className="mx-auto grid h-16 max-w-md grid-cols-5 items-center">
        <BottomLink {...mainNav[0]} />
        <BottomLink {...mainNav[1]} />
        <div className="grid place-items-center">
          <button
            type="button"
            onClick={() => sheet.openNew()}
            aria-label="Novo lançamento"
            className="-mt-7 grid size-14 place-items-center rounded-full bg-primary text-primary-ink shadow-card ring-4 ring-bg transition active:scale-95"
          >
            <Plus className="size-7" aria-hidden="true" />
          </button>
        </div>
        <BottomLink {...mainNav[2]} />
        <BottomLink to="/mais" label="Mais" icon={Ellipsis} />
      </div>
    </nav>
  );
}

function BottomLink({ to, label, icon: Icon }: NavItem) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `flex flex-col items-center gap-0.5 text-[11px] font-bold transition ${isActive ? "text-primary" : "text-muted"}`
      }
    >
      <Icon className="size-[22px]" aria-hidden="true" />
      {label}
    </NavLink>
  );
}

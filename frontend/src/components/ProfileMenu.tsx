import { LogOut, UserRound, Users } from "lucide-react";
import { Link } from "react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../features/auth/AuthProvider";

// Avatar com o menu do perfil (por enquanto: quem está logado e sair)
export function ProfileMenu({ name, email }: { name: string; email: string }) {
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora ou apertar Esc
  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Perfil de ${name}`}
        className="grid size-10 place-items-center rounded-full bg-accent-soft font-display text-lg font-semibold text-accent"
      >
        {name.charAt(0).toUpperCase()}
      </button>

      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-2 w-60 rounded-2xl bg-surface p-2 shadow-card ring-1 ring-line">
          <div className="px-3 py-2">
            <p className="truncate font-bold">{name}</p>
            <p className="truncate text-sm text-muted">{email}</p>
          </div>
          <Link
            role="menuitem"
            to="/mais"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 font-semibold text-muted transition hover:bg-surface-2 hover:text-ink"
          >
            <UserRound className="size-4" aria-hidden="true" />
            Perfil
          </Link>
          <Link
            role="menuitem"
            to="/household"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 font-semibold text-muted transition hover:bg-surface-2 hover:text-ink"
          >
            <Users className="size-4" aria-hidden="true" />
            Household e convites
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={() => logout()}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left font-semibold text-muted transition hover:bg-surface-2 hover:text-ink"
          >
            <LogOut className="size-4" aria-hidden="true" />
            Sair
          </button>
        </div>
      )}
    </div>
  );
}

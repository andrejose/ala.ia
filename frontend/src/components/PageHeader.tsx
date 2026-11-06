import type { ReactNode } from "react";
import { ThemeToggle } from "./ThemeToggle";

// Cabeçalho das telas internas: título, frase de apoio e ação principal
export function PageHeader({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <header className="mb-6 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-muted">{description}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <span className="lg:hidden">
          <ThemeToggle />
        </span>
        {action}
      </div>
    </header>
  );
}

import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

// Componentes básicos de interface, todos sobre os tokens do index.css

export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-card bg-surface shadow-card ring-1 ring-line/60 ${className}`} {...props} />;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <h2 className="font-display text-lg font-semibold">{children}</h2>
      {action}
    </div>
  );
}

type ButtonVariant = "primary" | "soft" | "ghost";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-ink hover:brightness-110",
  soft: "bg-primary-soft text-primary hover:brightness-95",
  ghost: "text-muted hover:bg-surface-2 hover:text-ink",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={`inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-5 font-bold transition active:scale-[0.98] disabled:opacity-50 ${buttonVariants[variant]} ${className}`}
      {...props}
    />
  );
}

export function TextField({
  label,
  hint,
  error,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string; id: string }) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1.5 block text-sm font-bold">{label}</span>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`h-12 w-full rounded-2xl border bg-surface px-4 text-base outline-none transition placeholder:text-muted/70 focus:ring-4 ${
          error ? "border-expense focus:ring-expense-soft" : "border-line focus:border-primary focus:ring-primary-soft"
        }`}
        {...props}
      />
      {error ? (
        <span id={`${id}-error`} className="mt-1.5 block text-sm font-semibold text-expense">
          {error}
        </span>
      ) : (
        hint && (
          <span id={`${id}-hint`} className="mt-1.5 block text-sm text-muted">
            {hint}
          </span>
        )
      )}
    </label>
  );
}

export function Badge({ tone, children }: { tone: "pending" | "income" | "expense"; children: ReactNode }) {
  const tones = {
    pending: "bg-pending-soft text-pending",
    income: "bg-income-soft text-income",
    expense: "bg-expense-soft text-expense",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${tones[tone]}`}>
      {children}
    </span>
  );
}

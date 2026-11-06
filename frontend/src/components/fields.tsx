import type { ReactNode, SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";

// Campos de formulário além do TextField (ui.tsx)

const fieldBox =
  "h-12 w-full rounded-2xl border bg-surface px-4 text-base outline-none transition focus:ring-4";
const okBorder = "border-line focus:border-primary focus:ring-primary-soft";
const errorBorder = "border-expense focus:ring-expense-soft";

function FieldMessage({ id, error, hint }: { id: string; error?: string; hint?: string }) {
  if (error) {
    return (
      <span id={`${id}-error`} className="mt-1.5 block text-sm font-semibold text-expense">
        {error}
      </span>
    );
  }
  if (hint) {
    return (
      <span id={`${id}-hint`} className="mt-1.5 block text-sm text-muted">
        {hint}
      </span>
    );
  }
  return null;
}

export function SelectField({
  id,
  label,
  error,
  hint,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { id: string; label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1.5 block text-sm font-bold">{label}</span>
      <span className="relative block">
        <select
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={`${fieldBox} appearance-none pr-10 ${error ? errorBorder : okBorder}`}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
      </span>
      <FieldMessage id={id} error={error} hint={hint} />
    </label>
  );
}

// Valor em reais, digitado no teclado numérico do celular
export function MoneyField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  large = false,
  autoFocus,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  large?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1.5 block text-sm font-bold">{label}</span>
      <span className="relative block">
        <span
          className={`pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 font-bold text-muted ${large ? "text-xl" : ""}`}
          aria-hidden="true"
        >
          R$
        </span>
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0,00"
          value={value}
          autoFocus={autoFocus}
          onChange={(event) => onChange(event.target.value.replace(/[^\d.,-]/g, ""))}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={`${fieldBox} tabular pl-12 ${large ? "h-16 font-display text-3xl font-semibold" : ""} ${error ? errorBorder : okBorder}`}
        />
      </span>
      <FieldMessage id={id} error={error} hint={hint} />
    </label>
  );
}

// Escolha entre poucas opções (ex.: Despesa | Receita | Transferência)
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string; activeClass?: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col rounded-2xl bg-surface-2 p-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`h-10 rounded-xl px-2 text-sm font-bold transition ${
              active ? (option.activeClass ?? "bg-surface text-ink shadow-card") : "text-muted hover:text-ink"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-4">
      <span>
        <span className="block font-bold">{label}</span>
        {description && <span className="block text-sm text-muted">{description}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
        <span className="h-7 w-12 rounded-full bg-line transition peer-checked:bg-primary peer-focus-visible:ring-4 peer-focus-visible:ring-primary-soft" />
        <span className="absolute top-1 left-1 size-5 rounded-full bg-surface shadow transition peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

export function FormError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-2xl bg-expense-soft px-4 py-3 text-sm font-semibold text-expense">
      {children}
    </p>
  );
}

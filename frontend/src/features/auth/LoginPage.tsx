import { useState, type FormEvent } from "react";
import { Logo } from "../../components/Logo";
import { ThemeToggle } from "../../components/ThemeToggle";
import { Button, TextField } from "../../components/ui";
import { ApiError } from "../../lib/api";
import { useAuth } from "./AuthProvider";

type Mode = "login" | "signup";

// Mensagens da tela para os códigos de erro mais comuns da API
const errorMessages: Record<string, string> = {
  INVALID_CREDENTIALS: "E-mail ou senha não conferem. Confira e tente de novo.",
  EMAIL_ALREADY_REGISTERED: "Já existe uma conta com este e-mail. Entre com ele ou use outro.",
  RATE_LIMITED: "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.",
  NETWORK_ERROR: "Não foi possível falar com o servidor. Confira se a API está rodando.",
};

// Entrada: login e cadastro. Ao entrar, os guardas de rota levam ao painel.
export function LoginPage() {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const isSignup = mode === "signup";

  function switchMode(next: Mode) {
    setMode(next);
    setFormError(null);
    setFieldErrors({});
    setNotice(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");

    setPending(true);
    setFormError(null);
    setFieldErrors({});
    try {
      if (isSignup) {
        const { needsConfirmation } = await signup(String(form.get("name") ?? ""), email, password);
        if (needsConfirmation) {
          setNotice("Conta criada. Enviamos um link para o seu e-mail: confirme e depois entre.");
          setMode("login");
        }
      } else {
        await login(email, password);
      }
    } catch (error) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors);
        if (error.code !== "VALIDATION_ERROR") setFormError(errorMessages[error.code] ?? error.message);
      } else {
        setFormError("Algo deu errado. Tente de novo.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <BrandPanel />

      <div className="flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <span className="lg:invisible">
            <Logo />
          </span>
          <ThemeToggle />
        </div>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            {isSignup ? "Vamos começar?" : "Que bom te ver de novo"}
          </h1>
          <p className="mt-2 text-muted">
            {isSignup
              ? "Crie sua conta e organize as finanças da casa, no seu ritmo."
              : "Entre para ver como estão as suas finanças."}
          </p>

          <div role="tablist" aria-label="Entrar ou criar conta" className="mt-8 grid grid-cols-2 rounded-2xl bg-surface-2 p-1">
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => switchMode(m)}
                className={`h-10 rounded-xl text-sm font-bold transition ${
                  mode === m ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink"
                }`}
              >
                {m === "login" ? "Entrar" : "Criar conta"}
              </button>
            ))}
          </div>

          {notice && (
            <p role="status" className="mt-6 rounded-2xl bg-income-soft px-4 py-3 text-sm font-semibold text-income">
              {notice}
            </p>
          )}

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            {isSignup && (
              <TextField
                id="name"
                name="name"
                label="Como podemos te chamar?"
                placeholder="Maria Silva"
                autoComplete="name"
                error={fieldErrors.name}
                required
              />
            )}
            <TextField
              id="email"
              name="email"
              type="email"
              label="E-mail"
              placeholder="voce@exemplo.com"
              autoComplete="email"
              error={fieldErrors.email}
              required
            />
            <TextField
              id="password"
              name="password"
              type="password"
              label="Senha"
              placeholder="••••••••"
              autoComplete={isSignup ? "new-password" : "current-password"}
              hint={isSignup ? "Pelo menos 6 caracteres." : undefined}
              error={fieldErrors.password}
              minLength={isSignup ? 6 : undefined}
              required
            />

            {formError && (
              <p role="alert" className="rounded-2xl bg-expense-soft px-4 py-3 text-sm font-semibold text-expense">
                {formError}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? (isSignup ? "Criando sua conta…" : "Entrando…") : isSignup ? "Criar minha conta" : "Entrar"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted">
            {isSignup ? "Já tem conta? " : "Ainda não tem conta? "}
            <button type="button" onClick={() => switchMode(isSignup ? "login" : "signup")} className="font-bold text-primary hover:underline">
              {isSignup ? "Entrar" : "Criar agora"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

// Lado esquerdo no computador: marca e o significado de ALA
function BrandPanel() {
  const pillars = [
    { letter: "A", word: "Autonomia", text: "decidir com clareza para onde vai cada real." },
    { letter: "L", word: "Liberdade", text: "dinheiro trabalhando para os seus planos." },
    { letter: "A", word: "Autocontrole", text: "pequenos hábitos, todo mês, sem culpa." },
  ];

  return (
    <aside className="relative hidden overflow-hidden bg-primary p-12 text-primary-ink lg:flex lg:flex-col">
      <svg viewBox="0 0 64 64" className="pointer-events-none absolute -right-24 -bottom-24 size-[560px] opacity-15" aria-hidden="true">
        <path d="M14 42c10-1 20-7 26-18 2 9-1 18-9 22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M22 47c9 0 18-3 26-12" fill="none" className="stroke-accent" strokeWidth="2" strokeLinecap="round" />
      </svg>

      <span className="inline-flex items-center gap-2.5">
        <span className="grid size-12 place-items-center rounded-[18px] bg-primary-ink/10">
          <svg viewBox="0 0 64 64" className="size-9" aria-hidden="true">
            <path d="M14 42c10-1 20-7 26-18 2 9-1 18-9 22" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
            <path d="M22 47c9 0 18-3 26-12" fill="none" className="stroke-accent" strokeWidth="5" strokeLinecap="round" />
          </svg>
        </span>
        <span className="font-display text-3xl font-semibold">
          ala<span className="text-accent">.</span>ia
        </span>
      </span>

      <div className="relative mt-auto max-w-md">
        <p className="font-display text-4xl leading-tight font-semibold">Suas finanças, com calma e no seu ritmo.</p>
        <ul className="mt-10 space-y-5">
          {pillars.map((p) => (
            <li key={p.word} className="flex gap-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-ink/10 font-display text-xl font-semibold text-accent">
                {p.letter}
              </span>
              <p className="leading-relaxed">
                <strong className="font-extrabold">{p.word}:</strong> <span className="opacity-85">{p.text}</span>
              </p>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

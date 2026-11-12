import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { renderApp } from "../../test/renderApp";
import { apiError, server, user } from "../../test/server";

describe("Entrar", () => {
  it("entra com e-mail e senha e abre o painel", async () => {
    let sent: unknown;
    server.use(
      http.post("*/api/auth/login", async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ user, session: { access_token: "a", refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: 4_102_444_800 } });
      })
    );
    const { user: u } = renderApp("/entrar");

    await u.type(await screen.findByLabelText(/^E-mail/), "maria@exemplo.com");
    await u.type(screen.getByLabelText(/^Senha/), "segredo123");
    await u.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Maria" })).toBeInTheDocument();
    expect(sent).toEqual({ email: "maria@exemplo.com", password: "segredo123" });
    expect(localStorage.getItem("ala.refresh_token")).toBe("r");
  });

  it("mostra uma mensagem clara quando a senha não confere", async () => {
    server.use(http.post("*/api/auth/login", () => apiError(401, "INVALID_CREDENTIALS", "Invalid login credentials")));
    const { user: u } = renderApp("/entrar");

    await u.type(await screen.findByLabelText(/^E-mail/), "maria@exemplo.com");
    await u.type(screen.getByLabelText(/^Senha/), "errada");
    await u.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("E-mail ou senha não conferem");
    expect(screen.getByRole("heading", { level: 1, name: "Que bom te ver de novo" })).toBeInTheDocument();
  });

  it("mostra os erros de validação da API junto de cada campo", async () => {
    server.use(
      http.post("*/api/auth/login", () =>
        apiError(400, "VALIDATION_ERROR", "Dados inválidos", [{ in: "body", path: "email", message: "E-mail inválido" }])
      )
    );
    const { user: u } = renderApp("/entrar");

    await u.type(await screen.findByLabelText(/^E-mail/), "maria@exemplo.com");
    await u.type(screen.getByLabelText(/^Senha/), "segredo123");
    await u.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("E-mail inválido")).toBeInTheDocument();
    expect(screen.getByLabelText(/^E-mail/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("leva quem não entrou para /entrar e, depois de entrar, de volta à página pedida", async () => {
    const { user: u, router } = renderApp("/lancamentos");

    expect(await screen.findByRole("heading", { level: 1, name: "Que bom te ver de novo" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/entrar");

    await u.type(screen.getByLabelText(/^E-mail/), "maria@exemplo.com");
    await u.type(screen.getByLabelText(/^Senha/), "segredo123");
    await u.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Lançamentos" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/lancamentos");
  });

  it("retoma a sessão salva ao abrir o app, sem pedir login", async () => {
    renderApp("/", { loggedIn: true });
    expect(await screen.findByRole("heading", { level: 1, name: "Maria" })).toBeInTheDocument();
  });

  it("no cadastro com confirmação de e-mail, avisa e volta para Entrar", async () => {
    let sent: unknown;
    server.use(
      http.post("*/api/auth/signup", async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ user, session: null }, { status: 201 });
      })
    );
    const { user: u } = renderApp("/entrar");

    await u.click(await screen.findByRole("tab", { name: "Criar conta" }));
    await u.type(screen.getByLabelText("Como podemos te chamar?"), "Maria Silva");
    await u.type(screen.getByLabelText(/^E-mail/), "maria@exemplo.com");
    await u.type(screen.getByLabelText(/^Senha/), "segredo123");
    await u.click(screen.getByRole("button", { name: "Criar minha conta" }));

    expect(await screen.findByRole("status")).toHaveTextContent("confirme e depois entre");
    expect(screen.getByRole("tab", { name: "Entrar" })).toHaveAttribute("aria-selected", "true");
    expect(sent).toEqual({ name: "Maria Silva", email: "maria@exemplo.com", password: "segredo123" });
  });
});

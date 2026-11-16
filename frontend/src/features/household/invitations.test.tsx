import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { renderApp } from "../../test/renderApp";
import { apiError, db, personal, server } from "../../test/server";

describe("Convidar", () => {
  it("o dono convida por e-mail e o convite aparece em pendentes", async () => {
    const { user } = renderApp("/espaco", { loggedIn: true });

    expect(await screen.findByText(/Nenhum convite pendente/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Convidar" }));

    const sheet = within(await screen.findByRole("dialog", { name: "Convidar pessoa" }));
    await user.type(sheet.getByRole("textbox", { name: "E-mail" }), "joao@exemplo.com");
    await user.selectOptions(sheet.getByRole("combobox", { name: /^Papel/ }), "Dono");
    await user.click(sheet.getByRole("button", { name: "Enviar convite" }));

    const done = within(await screen.findByRole("dialog", { name: "Convite criado" }));
    expect(done.getByText(/Mandamos um e-mail para/)).toHaveTextContent("joao@exemplo.com");
    await user.click(done.getByRole("button", { name: "Pronto" }));

    expect(await screen.findByText("joao@exemplo.com")).toBeInTheDocument();
    expect(screen.getByText("Dono, vale até 18/11/2026")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(db.requests.invitations).toEqual([{ email: "joao@exemplo.com", role: "owner" }]);
  });

  it("sem o e-mail de aviso, diz isso e oferece o link para mandar à pessoa", async () => {
    server.use(
      http.post("*/api/households/:id/invitations", async ({ request, params }) => {
        const body = (await request.json()) as { email: string };
        return HttpResponse.json(
          {
            id: "i9",
            household_id: String(params.id),
            email: body.email,
            role: "member",
            status: "pending",
            created_at: "2026-11-11T10:00:00Z",
            expires_at: "2026-11-18T10:00:00Z",
            invited_by: null,
            email_sent: false,
          },
          { status: 201 }
        );
      })
    );
    const { user } = renderApp("/espaco", { loggedIn: true });
    await user.click(await screen.findByRole("button", { name: "Convidar" }));
    const sheet = within(await screen.findByRole("dialog", { name: "Convidar pessoa" }));
    await user.type(sheet.getByRole("textbox", { name: "E-mail" }), "ana@exemplo.com");
    await user.click(sheet.getByRole("button", { name: "Enviar convite" }));

    const done = within(await screen.findByRole("dialog", { name: "Convite criado" }));
    expect(done.getByText(/e-mail de aviso não foi enviado/)).toHaveTextContent("ana@exemplo.com");
    expect(done.getByText(`${window.location.origin}/entrar`)).toBeInTheDocument();
    await user.click(done.getByRole("button", { name: "Copiar link" }));
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/entrar`);
    expect(done.getByRole("button", { name: "Copiado" })).toBeInTheDocument();

    // Fechar aqui não pede confirmação: o convite já foi criado
    await user.click(done.getByRole("button", { name: "Pronto" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("mostra o erro da API dentro do formulário de convite", async () => {
    server.use(
      http.post("*/api/households/:id/invitations", () =>
        apiError(409, "ALREADY_MEMBER", "Essa pessoa já participa deste household.")
      )
    );
    const { user } = renderApp("/espaco", { loggedIn: true });

    await user.click(await screen.findByRole("button", { name: "Convidar" }));
    const sheet = within(await screen.findByRole("dialog", { name: "Convidar pessoa" }));
    await user.type(sheet.getByRole("textbox", { name: "E-mail" }), "maria@exemplo.com");
    await user.click(sheet.getByRole("button", { name: "Enviar convite" }));

    // A mensagem chega com "household" e aparece com "espaço"
    expect(await sheet.findByRole("alert")).toHaveTextContent("Essa pessoa já participa deste espaço.");
    expect(screen.getByRole("dialog", { name: "Convidar pessoa" })).toBeInTheDocument();
  });

  it("quem é só membro não vê o botão de convidar", async () => {
    db.households = [{ ...personal, role: "member" }];
    renderApp("/espaco", { loggedIn: true });

    expect(await screen.findByText(/Você é membro deste espaço/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Convidar" })).not.toBeInTheDocument();
  });
});

describe("Convites recebidos", () => {
  const received = {
    id: "inv1",
    household_id: "h2",
    household_name: "Casa",
    role: "member" as const,
    invited_by_name: "João",
    created_at: "2026-11-10T10:00:00Z",
    expires_at: "2026-11-17T10:00:00Z",
  };

  it("ao aceitar, entra no espaço e passa a usá-lo", async () => {
    db.myInvitations = [received];
    const { user } = renderApp("/espaco", { loggedIn: true });

    const invitations = within(await screen.findByRole("region", { name: "Convites recebidos" }));
    expect(invitations.getByText(/João convidou você para/)).toHaveTextContent("João convidou você para Casa como membro.");
    await user.click(invitations.getByRole("button", { name: "Aceitar" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Casa" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Convites recebidos" })).not.toBeInTheDocument();
    expect(localStorage.getItem("ala.household")).toBe("h2");
  });

  it("ao recusar, o convite some e o espaço em uso continua o mesmo", async () => {
    db.myInvitations = [received];
    let declined: string | undefined;
    server.use(
      http.post("*/api/invitations/:id/decline", ({ params }) => {
        declined = String(params.id);
        db.myInvitations = [];
        return new HttpResponse(null, { status: 204 });
      })
    );
    const { user } = renderApp("/espaco", { loggedIn: true });

    const invitations = within(await screen.findByRole("region", { name: "Convites recebidos" }));
    await user.click(invitations.getByRole("button", { name: "Recusar" }));

    await expect.poll(() => screen.queryByRole("region", { name: "Convites recebidos" })).toBeNull();
    expect(declined).toBe("inv1");
    expect(screen.getByRole("heading", { level: 1, name: "Pessoal" })).toBeInTheDocument();
  });
});

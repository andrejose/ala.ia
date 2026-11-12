import { screen, within } from "@testing-library/react";
import { http } from "msw";
import { describe, expect, it } from "vitest";
import { today } from "../../lib/money";
import { renderApp } from "../../test/renderApp";
import { apiError, db, server } from "../../test/server";

// Abre o formulário pelo botão "Novo lançamento" e devolve o painel aberto
async function openSheet(path = "/") {
  const app = renderApp(path, { loggedIn: true });
  const [button] = await screen.findAllByRole("button", { name: "Novo lançamento" });
  await app.user.click(button);
  const sheet = await screen.findByRole("dialog", { name: "Novo lançamento" });
  // Espera as contas carregarem no seletor
  await within(sheet).findByRole("option", { name: "Conta corrente" });
  return { ...app, sheet: within(sheet) };
}

describe("Lançar", () => {
  it("lança uma despesa paga e fecha o formulário", async () => {
    const { user, sheet } = await openSheet();

    await user.type(sheet.getByRole("textbox", { name: "Valor" }), "1.234,56");
    await user.type(sheet.getByRole("textbox", { name: "Descrição" }), "Feira da semana");
    await user.selectOptions(sheet.getByRole("combobox", { name: "Saiu de" }), "Conta corrente");
    await user.selectOptions(sheet.getByRole("combobox", { name: "Categoria" }), "Mercado");
    await user.click(sheet.getByRole("button", { name: "Lançar" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Maria" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(db.requests.transactions).toEqual([
      {
        type: "expense",
        description: "Feira da semana",
        amount: 1234.56,
        account_id: "a1",
        destination_account_id: null,
        category_id: "c1",
        due_date: today(),
        payment_date: today(),
      },
    ]);
  });

  it("lança uma receita a receber, sem data de pagamento", async () => {
    const { user, sheet } = await openSheet();

    await user.click(sheet.getByRole("radio", { name: "Receita" }));
    await user.type(sheet.getByRole("textbox", { name: "Valor" }), "5000");
    await user.type(sheet.getByRole("textbox", { name: "Descrição" }), "Salário de novembro");
    await user.selectOptions(sheet.getByRole("combobox", { name: "Entrou em" }), "Conta corrente");
    // Na receita, só aparecem as categorias de receita
    expect(sheet.queryByRole("option", { name: "Mercado" })).not.toBeInTheDocument();
    await user.selectOptions(sheet.getByRole("combobox", { name: "Categoria" }), "Salário");
    await user.click(sheet.getByRole("switch", { name: /Já recebi/ }));
    await user.click(sheet.getByRole("button", { name: "Lançar" }));

    await expect.poll(() => db.requests.transactions).toHaveLength(1);
    expect(db.requests.transactions[0]).toMatchObject({
      type: "income",
      amount: 5000,
      category_id: "c2",
      payment_date: null,
    });
  });

  it("transfere entre contas sem categoria", async () => {
    const { user, sheet } = await openSheet();

    await user.click(sheet.getByRole("radio", { name: "Transferência" }));
    await user.type(sheet.getByRole("textbox", { name: "Valor" }), "200");
    await user.type(sheet.getByRole("textbox", { name: "Descrição" }), "Dinheiro para a semana");
    expect(sheet.queryByRole("combobox", { name: "Categoria" })).not.toBeInTheDocument();
    await user.selectOptions(sheet.getByRole("combobox", { name: "De" }), "Conta corrente");
    await user.selectOptions(sheet.getByRole("combobox", { name: "Para" }), "Carteira");
    await user.click(sheet.getByRole("button", { name: "Lançar" }));

    await expect.poll(() => db.requests.transactions).toHaveLength(1);
    expect(db.requests.transactions[0]).toMatchObject({
      type: "transfer",
      account_id: "a1",
      destination_account_id: "a2",
      category_id: null,
    });
  });

  it("confere os campos antes de enviar e não chama a API se faltar algo", async () => {
    const { user, sheet } = await openSheet();

    await user.type(sheet.getByRole("textbox", { name: "Descrição" }), "Sem valor");
    await user.click(sheet.getByRole("button", { name: "Lançar" }));

    expect(sheet.getByText("Informe um valor maior que zero. Ex.: 89,90")).toBeInTheDocument();
    expect(sheet.getByText("Escolha a conta.")).toBeInTheDocument();
    expect(sheet.getByText("Escolha a categoria.")).toBeInTheDocument();
    expect(db.requests.transactions).toHaveLength(0);
  });

  it("não deixa transferir para a mesma conta", async () => {
    const { user, sheet } = await openSheet();

    await user.click(sheet.getByRole("radio", { name: "Transferência" }));
    await user.type(sheet.getByRole("textbox", { name: "Valor" }), "10");
    await user.type(sheet.getByRole("textbox", { name: "Descrição" }), "Mesma conta");
    await user.selectOptions(sheet.getByRole("combobox", { name: "De" }), "Carteira");
    await user.selectOptions(sheet.getByRole("combobox", { name: "Para" }), "Carteira");
    await user.click(sheet.getByRole("button", { name: "Lançar" }));

    expect(sheet.getByText("Escolha uma conta diferente da de origem.")).toBeInTheDocument();
    expect(db.requests.transactions).toHaveLength(0);
  });

  it("mostra o erro da API e mantém o formulário aberto", async () => {
    server.use(
      http.post("*/api/households/:id/transactions", () =>
        apiError(422, "INVALID_REFERENCE", "Category does not belong to this household")
      )
    );
    const { user, sheet } = await openSheet();

    await user.type(sheet.getByRole("textbox", { name: "Valor" }), "50");
    await user.type(sheet.getByRole("textbox", { name: "Descrição" }), "Padaria");
    await user.selectOptions(sheet.getByRole("combobox", { name: "Saiu de" }), "Carteira");
    await user.selectOptions(sheet.getByRole("combobox", { name: "Categoria" }), "Mercado");
    await user.click(sheet.getByRole("button", { name: "Lançar" }));

    expect(await sheet.findByRole("alert")).toHaveTextContent("A conta ou a categoria escolhida não vale para este lançamento");
    expect(screen.getByRole("dialog", { name: "Novo lançamento" })).toBeInTheDocument();
  });

  it("sem contas, leva a pessoa a cadastrar uma", async () => {
    db.accounts = [];
    const { user } = renderApp("/", { loggedIn: true });
    const [button] = await screen.findAllByRole("button", { name: "Novo lançamento" });
    await user.click(button);

    const sheet = within(await screen.findByRole("dialog", { name: "Novo lançamento" }));
    expect(await sheet.findByRole("link", { name: "Cadastrar conta" })).toHaveAttribute("href", "/contas");
    expect(sheet.queryByRole("button", { name: "Lançar" })).not.toBeInTheDocument();
  });
});

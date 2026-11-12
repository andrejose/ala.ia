import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { today } from "../../lib/money";
import { renderApp } from "../../test/renderApp";
import { db } from "../../test/server";

function addCard(current_balance: number) {
  db.accounts.push({
    id: "card",
    household_id: "h1",
    name: "Nubank",
    type: "credit_card",
    is_active: true,
    initial_balance: 0,
    current_balance,
  });
}

describe("Cartão de crédito", () => {
  it("cadastra o cartão pedindo a fatura em aberto e grava como saldo negativo", async () => {
    const { user } = renderApp("/contas", { loggedIn: true });

    await user.click(await screen.findByRole("button", { name: "Nova conta" }));
    const sheet = within(await screen.findByRole("dialog", { name: "Nova conta" }));
    await user.type(sheet.getByRole("textbox", { name: "Nome" }), "Nubank");
    await user.selectOptions(sheet.getByRole("combobox", { name: "Tipo" }), "Cartão de crédito");
    await user.type(sheet.getByRole("textbox", { name: /^Fatura em aberto no início/ }), "350");
    await user.click(sheet.getByRole("button", { name: "Criar conta" }));

    await expect.poll(() => db.requests.accounts).toEqual([{ name: "Nubank", type: "credit_card", initial_balance: -350 }]);
  });

  it("mostra a fatura em aberto e o pagamento abre a transferência já preenchida", async () => {
    addCard(-800);
    const { user } = renderApp("/contas", { loggedIn: true });

    const row = (await screen.findByText("Nubank")).closest("button")!;
    expect(row).toHaveTextContent(/Fatura em aberto\s*R\$\s800,00/);
    expect(row).not.toHaveTextContent("−");

    await user.click(screen.getByRole("button", { name: "Pagar fatura do Nubank" }));
    const sheet = within(await screen.findByRole("dialog", { name: "Novo lançamento" }));

    expect(sheet.getByRole("radio", { name: "Transferência" })).toBeChecked();
    expect(sheet.getByRole("textbox", { name: "Valor" })).toHaveValue("800,00");
    expect(sheet.getByRole("combobox", { name: "De" })).toHaveValue("a1");
    expect(sheet.getByRole("combobox", { name: "Para" })).toHaveValue("card");

    await user.click(sheet.getByRole("button", { name: "Lançar" }));

    await expect.poll(() => db.requests.transactions).toEqual([
      {
        type: "transfer",
        description: "Fatura Nubank",
        amount: 800,
        account_id: "a1",
        destination_account_id: "card",
        category_id: null,
        due_date: today(),
        payment_date: today(),
      },
    ]);
  });

  it("sem dívida no cartão, não oferece pagar fatura", async () => {
    addCard(0);
    renderApp("/contas", { loggedIn: true });

    const row = (await screen.findByText("Nubank")).closest("button")!;
    expect(row).toHaveTextContent("Fatura paga");
    expect(screen.queryByRole("button", { name: /Pagar fatura/ })).not.toBeInTheDocument();
  });

  it("no painel, o cartão aparece com a fatura em aberto", async () => {
    addCard(-120.5);
    renderApp("/", { loggedIn: true });

    const accounts = within(await screen.findByRole("region", { name: "Suas contas" }));
    expect(await accounts.findByText(/fatura em aberto/)).toBeInTheDocument();
    expect(accounts.getByText(/R\$\s120,50/)).toBeInTheDocument();
  });
});

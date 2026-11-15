import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Account } from "../../lib/types";
import { renderApp } from "../../test/renderApp";
import { db } from "../../test/server";

function account(id: string, name: string, type: Account["type"], current_balance: number, is_active = true): Account {
  return { id, household_id: "h1", name, type, is_active, initial_balance: current_balance, current_balance };
}

describe("Painel — saldo por tipo de conta", () => {
  it("mostra o total e quanto há em cada tipo de conta, com a fatura do cartão descontada", async () => {
    db.accounts = [
      account("a1", "Conta corrente", "checking", 1000),
      account("a2", "Corrente Santander", "checking", 500.5),
      account("a3", "Poupança BB", "savings", 21750.96),
      account("a4", "Tesouro", "investment", 7000),
      account("a5", "Carteira", "cash", 150),
      account("a6", "Nubank", "credit_card", -331.95),
      // Arquivada: fica fora do total e dos tipos
      account("a7", "Conta antiga", "investment", 999, false),
    ];
    renderApp("/", { loggedIn: true });

    const hero = within(await screen.findByRole("region", { name: "Saldo" }));
    expect(await hero.findByText(/R\$\s30\.069,51/)).toBeInTheDocument();

    const groups = within(hero.getByLabelText("Saldo por tipo de conta"));
    const terms = groups.getAllByRole("term").map((dt) => dt.textContent);
    const values = groups.getAllByRole("definition").map((dd) => dd.textContent);
    expect(terms).toEqual(["Conta corrente", "Poupança", "Investimentos", "Dinheiro", "Faturas dos cartões"]);
    expect(values.map((v) => v?.replace(/\s/g, " "))).toEqual([
      "R$ 1.500,50",
      "R$ 21.750,96",
      "R$ 7.000,00",
      "R$ 150,00",
      "− R$ 331,95",
    ]);
  });

  it("com um tipo de conta só, não repete o total em blocos", async () => {
    db.accounts = [account("a1", "Conta corrente", "checking", 1000), account("a2", "Corrente 2", "checking", 200)];
    renderApp("/", { loggedIn: true });

    const hero = within(await screen.findByRole("region", { name: "Saldo" }));
    await hero.findByText(/R\$\s1\.200,00/);
    expect(hero.queryByLabelText("Saldo por tipo de conta")).not.toBeInTheDocument();
  });
});

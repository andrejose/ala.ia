import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderApp } from "../../test/renderApp";
import { db } from "../../test/server";

beforeEach(() => {
  // Só o relógio é fixo (novembro de 2026); os timers continuam reais
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 15, 12));
  db.categories.push(
    { id: "c3", household_id: "h1", name: "Transporte", type: "expense", color: null, icon: null, is_active: true },
    { id: "c4", household_id: "h1", name: "Lazer", type: "expense", color: null, icon: null, is_active: true }
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Orçamento", () => {
  it("mostra cada limite com o gasto do mês e o que falta ou passou", async () => {
    db.budgets = { c1: 800, c3: 200 };
    db.budgetSpent = { "2026-11:c1": { paid: 400, pending: 200 }, "2026-11:c3": { paid: 250, pending: 0 } };
    renderApp("/orcamento", { loggedIn: true });

    const list = within(await screen.findByRole("list", { name: "Limites do mês" }));
    const [transport, market] = list.getAllByRole("listitem");
    expect(transport).toHaveTextContent(/Transporte\s*R\$\s250,00 de R\$\s200,00/);
    expect(transport).toHaveTextContent(/Passou R\$\s50,00 do limite/);
    expect(market).toHaveTextContent(/Faltam R\$\s200,00/);
    expect(market).toHaveTextContent(/R\$\s200,00 ainda a pagar/);
    expect(list.getByRole("progressbar", { name: "Mercado: 75% do limite" })).toHaveAttribute("aria-valuenow", "75");

    // Total do mês e as categorias de despesa sem limite
    expect(screen.getByText(/Ainda cabem/)).toHaveTextContent(/Ainda cabem R\$\s150,00 neste mês/);
    expect(screen.getByRole("button", { name: "Definir limite de Lazer" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Definir limite de Salário/ })).not.toBeInTheDocument();
  });

  it("define o limite de uma categoria sem limite", async () => {
    const { user } = renderApp("/orcamento", { loggedIn: true });

    await user.click(await screen.findByRole("button", { name: "Definir limite de Lazer" }));
    const sheet = within(await screen.findByRole("dialog", { name: "Limite de Lazer" }));
    await user.type(sheet.getByRole("textbox", { name: /^Limite por mês/ }), "300");
    await user.click(sheet.getByRole("button", { name: "Salvar limite" }));

    await expect.poll(() => db.requests.budgets).toEqual([{ category_id: "c4", amount: 300 }]);
    expect(await screen.findByRole("list", { name: "Limites do mês" })).toHaveTextContent("Lazer");
  });

  it("troca e tira um limite", async () => {
    db.budgets = { c1: 800 };
    const { user } = renderApp("/orcamento", { loggedIn: true });

    await user.click(await screen.findByRole("button", { name: /Mercado/ }));
    let sheet = within(await screen.findByRole("dialog", { name: "Limite de Mercado" }));
    const amount = sheet.getByRole("textbox", { name: /^Limite por mês/ });
    expect(amount).toHaveValue("800,00");
    await user.clear(amount);
    await user.type(amount, "0");
    await user.click(sheet.getByRole("button", { name: "Salvar limite" }));
    expect(await sheet.findByText(/Informe um valor maior que zero/)).toBeInTheDocument();
    expect(db.requests.budgets).toEqual([]);

    await user.clear(amount);
    await user.type(amount, "950");
    await user.click(sheet.getByRole("button", { name: "Salvar limite" }));
    await expect.poll(() => db.requests.budgets).toEqual([{ category_id: "c1", amount: 950 }]);

    await user.click(await screen.findByRole("button", { name: /Mercado/ }));
    sheet = within(await screen.findByRole("dialog", { name: "Limite de Mercado" }));
    await user.click(sheet.getByRole("button", { name: "Tirar limite" }));
    await expect.poll(() => db.requests.budgets.at(-1)).toEqual({ deleted: "c1" });
    expect(await screen.findByText("Nenhum limite ainda")).toBeInTheDocument();
  });

  it("no painel, mostra as categorias mais perto do limite, só quando há limites", async () => {
    db.budgets = { c1: 800 };
    db.budgetSpent = { "2026-11:c1": { paid: 720, pending: 0 } };
    renderApp("/", { loggedIn: true });

    const section = within(await screen.findByRole("region", { name: "Orçamento do mês" }));
    expect(section.getByRole("progressbar", { name: "Mercado: 90% do limite" })).toBeInTheDocument();
    expect(section.getByRole("link", { name: "Orçamento" })).toHaveAttribute("href", "/orcamento");
  });

  it("sem limites, o painel não mostra o orçamento", async () => {
    renderApp("/", { loggedIn: true });

    await screen.findByRole("region", { name: "Para onde foi o dinheiro" });
    expect(screen.queryByRole("region", { name: "Orçamento do mês" })).not.toBeInTheDocument();
  });
});

import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TransactionSearchRow } from "../../lib/types";
import { renderApp } from "../../test/renderApp";
import { db } from "../../test/server";

function row(id: string, description: string, amount: number, extra: Partial<TransactionSearchRow> = {}): TransactionSearchRow {
  return {
    id,
    type: "expense",
    description,
    amount,
    account_id: "a1",
    destination_account_id: null,
    category_id: "c9",
    due_date: "2026-10-14",
    payment_date: "2026-10-14",
    recurrence_id: null,
    imported: true,
    account_name: "Conta corrente",
    destination_account_name: null,
    category_name: "Indefinido",
    status: "paid",
    ...extra,
  };
}

// O que a tela pediu por último à busca, como objeto
function lastSearch() {
  return Object.fromEntries(new URLSearchParams(db.searchRequests.at(-1)));
}

function table() {
  return within(screen.getByRole("table", { name: "Lançamentos" }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 15, 12));
  db.categories.push(
    { id: "c9", household_id: "h1", name: "Indefinido", type: "expense", color: null, icon: null, is_active: true },
    { id: "c3", household_id: "h1", name: "Transporte", type: "expense", color: null, icon: null, is_active: true }
  );
  db.search = {
    rows: [
      row("t1", "POSTO LINHA VERDE", 228.49, { due_date: "2026-10-31", payment_date: null, status: "pending" }),
      row("t2", "AÇOUGUE SERRA ALTA", 69.67, { due_date: "2026-10-20" }),
      row("t3", "Guardar", 500, {
        type: "transfer",
        category_id: null,
        category_name: null,
        destination_account_id: "a2",
        destination_account_name: "Carteira",
      }),
    ],
    total: 3,
    totals: { count: 3, income: 0, expense: 298.16, transfer: 500 },
  };
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Tabela de lançamentos", () => {
  it("abre pela tela de lançamentos, mostra as colunas e os totais do filtro", async () => {
    const { user } = renderApp("/lancamentos", { loggedIn: true });

    await user.click(await screen.findByRole("link", { name: "Tabela" }));
    const rows = await screen.findAllByRole("row");

    expect(table().getAllByRole("columnheader").map((th) => th.textContent)).toEqual(["", "Data", "Descrição", "Categoria", "Conta", "Valor", "Situação"]);
    expect(rows[1]).toHaveTextContent(/31\/10\/2026\s*POSTO LINHA VERDE\s*Indefinido\s*Conta corrente\s*− R\$\s228,49\s*A pagar/);
    expect(rows[3]).toHaveTextContent(/Guardar\s*—\s*Conta corrente → Carteira\s*R\$\s500,00\s*Pago/);
    expect(screen.getByRole("status", { name: "Totais do filtro" })).toHaveTextContent(
      /3 lançamentos · saiu R\$\s298,16 · transferido R\$\s500,00/
    );
    expect(lastSearch()).toEqual({ sort: "date", order: "desc", limit: "50", offset: "0" });
  });

  it("ordena clicando no título da coluna", async () => {
    const { user } = renderApp("/lancamentos/tabela", { loggedIn: true });

    await screen.findAllByRole("row");
    const amount = table().getByRole("columnheader", { name: /Valor/ });
    await user.click(within(amount).getByRole("button"));
    await vi.waitFor(() => expect(lastSearch()).toMatchObject({ sort: "amount", order: "desc" }));
    expect(amount).toHaveAttribute("aria-sort", "descending");

    await user.click(within(amount).getByRole("button"));
    await vi.waitFor(() => expect(lastSearch()).toMatchObject({ sort: "amount", order: "asc" }));
    expect(amount).toHaveAttribute("aria-sort", "ascending");

    // Coluna de texto começa em ordem alfabética
    await user.click(within(table().getByRole("columnheader", { name: /Descrição/ })).getByRole("button"));
    await vi.waitFor(() => expect(lastSearch()).toMatchObject({ sort: "description", order: "asc" }));
  });

  it("filtra pela descrição, categoria (inclusive sem categoria), tipo e período", async () => {
    const { user } = renderApp("/lancamentos/tabela", { loggedIn: true });

    await screen.findAllByRole("row");
    await user.type(screen.getByLabelText("Descrição"), "posto");
    await vi.waitFor(() => expect(lastSearch()).toMatchObject({ q: "posto" }));

    await user.click(screen.getByRole("button", { name: /^Categoria / }));
    await user.click(screen.getByRole("checkbox", { name: "Sem categoria (transferências)" }));
    await user.click(screen.getByRole("checkbox", { name: "Indefinido" }));
    await vi.waitFor(() => expect(lastSearch()).toMatchObject({ category: "none,c9" }));
    expect(screen.getByRole("button", { name: /^Categoria / })).toHaveTextContent("2 escolhidas");

    await user.click(within(screen.getByRole("group", { name: "Tipo" })).getByRole("button", { name: "Despesa" }));
    await user.click(screen.getByRole("button", { name: "Este ano" }));
    await vi.waitFor(() => expect(lastSearch()).toMatchObject({ type: "expense", from: "2026-01-01", to: "2026-12-31" }));

    // Limpar volta à busca sem filtros (que já está no cache, sem nova requisição)
    await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
    await vi.waitFor(() => expect(screen.getByLabelText("Descrição")).toHaveValue(""));
    expect(screen.getByRole("button", { name: /^Categoria / })).toHaveTextContent("Todas");
    expect(screen.getByLabelText("De")).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Limpar filtros" })).not.toBeInTheDocument();
  });

  it("troca a categoria das linhas marcadas", async () => {
    const { user } = renderApp("/lancamentos/tabela", { loggedIn: true });

    await screen.findAllByRole("row");
    await user.click(table().getByRole("checkbox", { name: "Marcar POSTO LINHA VERDE" }));
    await user.click(table().getByRole("checkbox", { name: "Marcar AÇOUGUE SERRA ALTA" }));
    expect(screen.getByText("2 marcados")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Nova categoria"), "Transporte");
    await user.click(screen.getByRole("button", { name: "Mover" }));

    await expect.poll(() => db.recategorizeRequests).toEqual([{ category_id: "c3", ids: ["t1", "t2"] }]);
    expect(await screen.findByText("2 lançamentos movidos para Transporte.")).toBeInTheDocument();
    expect(screen.queryByText(/marcados/)).not.toBeInTheDocument();
  });

  it("marca todos do filtro, além da página, e manda o filtro em vez dos ids", async () => {
    db.search.total = 120;
    db.search.totals.count = 120;
    const { user } = renderApp("/lancamentos/tabela?categoria=c9&de=2026-01-01&ate=2026-11-15", { loggedIn: true });

    await screen.findAllByRole("row");
    await user.click(table().getByRole("checkbox", { name: "Marcar todos desta página" }));
    await user.click(screen.getByRole("button", { name: "Marcar todos os 120 do filtro" }));
    expect(screen.getByText("Todos os 120 do filtro marcados")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Nova categoria"), "Transporte");
    await user.click(screen.getByRole("button", { name: "Mover" }));

    await expect.poll(() => db.recategorizeRequests).toEqual([
      { category_id: "c3", filter: { category: "c9", from: "2026-01-01", to: "2026-11-15" } },
    ]);
  });

  it("exporta o CSV do filtro", async () => {
    const createObjectURL = vi.fn(() => "blob:lancamentos");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const { user } = renderApp("/lancamentos/tabela?busca=posto", { loggedIn: true });

    await screen.findAllByRole("row");
    await user.click(screen.getByRole("button", { name: "Exportar CSV" }));

    await expect.poll(() => db.exportRequests).toEqual(["q=posto&sort=date&order=desc"]);
    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    click.mockRestore();
    vi.unstubAllGlobals();
  });

  it("tocar numa linha abre o lançamento para editar", async () => {
    db.transactions = [];
    const { user } = renderApp("/lancamentos/tabela", { loggedIn: true });

    await screen.findAllByRole("row");
    await user.click(table().getByRole("button", { name: "AÇOUGUE SERRA ALTA" }));

    const sheet = within(await screen.findByRole("dialog", { name: "Editar lançamento" }));
    expect(sheet.getByRole("textbox", { name: "Descrição" })).toHaveValue("AÇOUGUE SERRA ALTA");
  });

  it("nos relatórios, a categoria leva à tabela filtrada por ela e pelo mês", async () => {
    db.reports.byCategory = { "2026-11:expense": [{ category_id: "c9", name: "Indefinido", color: null, icon: null, total: 300, paid: 300, pending: 0, transaction_count: 3 }] };
    const { user } = renderApp("/relatorios", { loggedIn: true });

    const list = within(await screen.findByRole("list", { name: "Despesas por categoria" }));
    await user.click(list.getByRole("link", { name: /Indefinido/ }));

    await screen.findAllByRole("row");
    expect(lastSearch()).toMatchObject({ category: "c9", type: "expense", from: "2026-11-01", to: "2026-11-30" });
    expect(screen.getByLabelText("De")).toHaveValue("2026-11-01");
  });
});

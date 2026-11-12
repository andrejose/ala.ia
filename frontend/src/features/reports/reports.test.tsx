import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReportByCategory } from "../../lib/types";
import { renderApp } from "../../test/renderApp";
import { db } from "../../test/server";

type CategoryRow = ReportByCategory["categories"][number];

function row(name: string, total: number, extra: Partial<CategoryRow> = {}): CategoryRow {
  return {
    category_id: name.toLowerCase(),
    name,
    color: null,
    icon: null,
    total,
    paid: total,
    pending: 0,
    transaction_count: 1,
    ...extra,
  };
}

function chartMonths() {
  const chart = screen.getByRole("group", { name: "Receitas e despesas por mês" });
  return within(chart)
    .getAllByRole("button")
    .map((button) => button.textContent);
}

beforeEach(() => {
  // Só o relógio é fixo (novembro de 2026); os timers continuam reais
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 15, 12));

  db.reports.months = {
    "2026-10": { income: { paid: 5000, pending: 0 }, expense: { paid: 2000, pending: 0 } },
    "2026-11": { income: { paid: 5000, pending: 0 }, expense: { paid: 2000, pending: 500 } },
  };
  db.reports.byCategory = {
    "2026-11:expense": [row("Aluguel", 1500, { paid: 1000, pending: 500 }), row("Mercado", 1000, { transaction_count: 4 })],
    "2026-11:income": [row("Salário", 5000)],
  };
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Tela de relatórios", () => {
  it("abre pelo painel e mostra o mês, a comparação e as despesas por categoria", async () => {
    const { user } = renderApp("/", { loggedIn: true });

    const spending = within(await screen.findByRole("region", { name: "Para onde foi o dinheiro" }));
    await user.click(spending.getByRole("link", { name: "Relatórios" }));

    expect(await screen.findByRole("heading", { name: "Relatórios" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Novembro de 2026" })).toBeInTheDocument();

    // Saiu conta o pendente e avisa quanto falta pagar
    const totals = screen.getByRole("region", { name: "Totais do mês" });
    await vi.waitFor(() => expect(totals).toHaveTextContent(/Saiu\s*R\$\s2\.500,00\s*R\$\s500,00 a pagar/));
    expect(totals).toHaveTextContent(/Resultado\s*R\$\s2\.500,00/);

    expect(screen.getByText(/Você gastou/)).toHaveTextContent(/Você gastou R\$\s500,00 a mais que em outubro \(\+25%\)\./);

    const list = within(await screen.findByRole("list", { name: "Despesas por categoria" }));
    const items = list.getAllByRole("listitem");
    expect(items.map((item) => item.querySelector(".truncate")?.textContent)).toEqual(["Aluguel", "Mercado"]);
    expect(items[0]).toHaveTextContent("60%");
    expect(items[0]).toHaveTextContent("a pagar");
    expect(items[1]).toHaveTextContent("4 lançamentos");
  });

  it("troca para receitas", async () => {
    const { user } = renderApp("/relatorios", { loggedIn: true });

    await screen.findByRole("list", { name: "Despesas por categoria" });
    await user.click(screen.getByRole("button", { name: "Receitas" }));

    const list = within(await screen.findByRole("list", { name: "Receitas por categoria" }));
    expect(list.getByText("Salário")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Receitas" })).toHaveAttribute("aria-pressed", "true");
  });

  it("tocar num mês do gráfico seleciona o mês sem mover o gráfico", async () => {
    const { user } = renderApp("/relatorios", { loggedIn: true });

    await screen.findByRole("group", { name: "Receitas e despesas por mês" });
    expect(chartMonths()).toEqual(["jun", "jul", "ago", "set", "out", "nov"]);

    await user.click(screen.getByRole("button", { name: /^Outubro de 2026: entrou R\$\s5\.000,00, saiu R\$\s2\.000,00$/ }));

    expect(await screen.findByRole("heading", { name: "Outubro de 2026" })).toBeInTheDocument();
    expect(chartMonths()).toEqual(["jun", "jul", "ago", "set", "out", "nov"]);
    expect(screen.getByRole("button", { name: /^Outubro de 2026/ })).toHaveAttribute("aria-pressed", "true");
    // Setembro está zerado: não há o que comparar
    expect(screen.getByText(/Em setembro não houve despesas/)).toBeInTheDocument();
  });

  it("andar para um mês fora do gráfico leva o gráfico junto", async () => {
    const { user } = renderApp("/relatorios", { loggedIn: true });

    await screen.findByRole("group", { name: "Receitas e despesas por mês" });
    await user.click(screen.getByRole("button", { name: "Próximo mês" }));

    expect(await screen.findByRole("heading", { name: "Dezembro de 2026" })).toBeInTheDocument();
    expect(await screen.findByText("Nenhuma despesa em dezembro.")).toBeInTheDocument();
    await vi.waitFor(() => expect(chartMonths()).toEqual(["jul", "ago", "set", "out", "nov", "dez"]));
  });
});

import { fireEvent, screen, within } from "@testing-library/react";
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

  it("no modo Período, abre nos últimos 30 dias e compara com os 30 dias anteriores", async () => {
    db.reports.periods = {
      "2026-10-17:2026-11-15": { income: { paid: 5000, pending: 0 }, expense: { paid: 1500, pending: 300 } },
      "2026-09-17:2026-10-16": { income: { paid: 5000, pending: 0 }, expense: { paid: 1200, pending: 0 } },
    };
    db.reports.byCategory["2026-10-17:2026-11-15:expense"] = [row("Mercado", 1800)];
    const { user } = renderApp("/relatorios", { loggedIn: true });

    await screen.findByRole("group", { name: "Receitas e despesas por mês" });
    await user.click(screen.getByRole("radio", { name: "Período" }));

    expect(await screen.findByText("17/10/2026 a 15/11/2026 · 30 dias")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Últimos 30 dias" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("De")).toHaveValue("2026-10-17");
    expect(screen.getByLabelText("Até")).toHaveValue("2026-11-15");

    const totals = screen.getByRole("region", { name: "Totais do período" });
    await vi.waitFor(() => expect(totals).toHaveTextContent(/Saiu\s*R\$\s1\.800,00\s*R\$\s300,00 a pagar/));
    expect(screen.getByText(/Você gastou/)).toHaveTextContent(/R\$\s600,00 a mais que nos 30 dias anteriores \(\+50%\)\./);

    // O período cobre outubro e novembro: o gráfico mostra os dois meses
    await vi.waitFor(() => expect(chartMonths()).toEqual(["out", "nov"]));
    expect(await screen.findByRole("list", { name: "Despesas por categoria" })).toHaveTextContent("Mercado");
    expect(db.reportRequests).toContain("by-category?from=2026-10-17&to=2026-11-15&type=expense");
  });

  it("o período fica no endereço; dentro de um mês só, não há gráfico", async () => {
    db.reports.periods = { "2026-11-01:2026-11-10": { income: { paid: 0, pending: 0 }, expense: { paid: 90, pending: 0 } } };
    renderApp("/relatorios?de=2026-11-01&ate=2026-11-10", { loggedIn: true });

    expect(await screen.findByRole("radio", { name: "Período" })).toHaveAttribute("aria-checked", "true");
    const totals = await screen.findByRole("region", { name: "Totais do período" });
    await vi.waitFor(() => expect(totals).toHaveTextContent(/Saiu\s*R\$\s90,00/));
    expect(screen.queryByRole("group", { name: "Receitas e despesas por mês" })).not.toBeInTheDocument();
    expect(db.reportRequests.some((r) => r.startsWith("monthly"))).toBe(false);
    expect(await screen.findByText("Nenhuma despesa no período.")).toBeInTheDocument();
  });

  it("atalho e datas trocam o período; data inicial depois da final é recusada sem consultar", async () => {
    const { user } = renderApp("/relatorios?de=2026-11-01&ate=2026-11-10", { loggedIn: true });

    await user.click(await screen.findByRole("button", { name: "Ano passado" }));
    expect(await screen.findByText("01/01/2025 a 31/12/2025 · 365 dias")).toBeInTheDocument();
    await vi.waitFor(() => expect(chartMonths()).toHaveLength(12));

    const before = db.reportRequests.length;
    fireEvent.change(screen.getByLabelText("De"), { target: { value: "2026-01-01" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("A data inicial precisa ser antes da final.");
    expect(screen.queryByRole("region", { name: "Totais do período" })).not.toBeInTheDocument();
    expect(db.reportRequests.slice(before).filter((r) => r.includes("2026-01-01"))).toEqual([]);
  });

  it("tocar num mês do gráfico do período abre aquele mês inteiro", async () => {
    const { user } = renderApp("/relatorios?de=2026-09-10&ate=2026-11-15", { loggedIn: true });

    await vi.waitFor(() => expect(chartMonths()).toEqual(["set", "out", "nov"]));
    await user.click(screen.getByRole("button", { name: /^Outubro de 2026/ }));

    expect(await screen.findByRole("heading", { name: "Outubro de 2026" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Mês" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("region", { name: "Totais do mês" })).toBeInTheDocument();
  });

  it("voltar para o modo Mês volta ao mês atual", async () => {
    const { user } = renderApp("/relatorios?de=2026-11-01&ate=2026-11-10", { loggedIn: true });

    await user.click(await screen.findByRole("radio", { name: "Mês" }));
    expect(await screen.findByRole("heading", { name: "Novembro de 2026" })).toBeInTheDocument();
    expect(screen.queryByLabelText("De")).not.toBeInTheDocument();
  });
});

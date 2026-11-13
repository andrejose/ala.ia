import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { today } from "../../lib/money";
import type { Recurrence } from "../../lib/types";
import { renderApp } from "../../test/renderApp";
import { db } from "../../test/server";

function recurrence(extra: Partial<Recurrence> = {}): Recurrence {
  return {
    id: "r1",
    household_id: "h1",
    type: "expense",
    description: "Aluguel",
    amount: 1800,
    account_id: "a1",
    destination_account_id: null,
    category_id: "c1",
    day_of_month: 10,
    start_month: "2026-11",
    occurrences: null,
    auto_paid: false,
    is_active: true,
    generated_until: "2026-12",
    ...extra,
  };
}

async function openNewTransaction() {
  const app = renderApp("/", { loggedIn: true });
  const [button] = await screen.findAllByRole("button", { name: "Novo lançamento" });
  await app.user.click(button);
  const sheet = within(await screen.findByRole("dialog", { name: "Novo lançamento" }));
  await sheet.findByRole("option", { name: "Conta corrente" });
  return { ...app, sheet };
}

describe("Lançamentos recorrentes", () => {
  it("ao abrir o app, gera os lançamentos recorrentes que faltam (uma vez)", async () => {
    renderApp("/", { loggedIn: true });

    await screen.findByRole("heading", { level: 1, name: "Maria" });
    await expect.poll(() => db.requests.materialize).toBe(1);
  });

  it("lançar com \"Repetir todo mês\" cria a recorrência, com parcelas e a pagar por padrão", async () => {
    const { user, sheet } = await openNewTransaction();

    await user.type(sheet.getByRole("textbox", { name: "Valor" }), "300");
    await user.type(sheet.getByRole("textbox", { name: "Descrição" }), "Geladeira");
    await user.selectOptions(sheet.getByRole("combobox", { name: "Saiu de" }), "Conta corrente");
    await user.selectOptions(sheet.getByRole("combobox", { name: "Categoria" }), "Mercado");
    await user.click(sheet.getByRole("switch", { name: /Repetir todo mês/ }));

    // Repetindo, o "já paguei" vira débito automático, desligado
    expect(sheet.getByRole("switch", { name: /Débito automático/ })).not.toBeChecked();
    await user.type(sheet.getByRole("textbox", { name: /^Quantas vezes/ }), "10");
    await user.click(sheet.getByRole("button", { name: "Lançar e repetir" }));

    await expect.poll(() => db.requests.recurrences).toEqual([
      {
        type: "expense",
        description: "Geladeira",
        amount: 300,
        account_id: "a1",
        destination_account_id: null,
        category_id: "c1",
        day_of_month: Number(today().slice(8, 10)),
        start_month: today().slice(0, 7),
        occurrences: 10,
        auto_paid: false,
      },
    ]);
    expect(db.requests.transactions).toEqual([]);
    await expect.poll(() => screen.queryByRole("dialog")).toBeNull();
  });

  it("recusa \"Quantas vezes\" fora do intervalo antes de enviar", async () => {
    const { user, sheet } = await openNewTransaction();

    await user.type(sheet.getByRole("textbox", { name: "Valor" }), "50");
    await user.type(sheet.getByRole("textbox", { name: "Descrição" }), "Curso");
    await user.selectOptions(sheet.getByRole("combobox", { name: "Saiu de" }), "Conta corrente");
    await user.selectOptions(sheet.getByRole("combobox", { name: "Categoria" }), "Mercado");
    await user.click(sheet.getByRole("switch", { name: /Repetir todo mês/ }));
    await user.type(sheet.getByRole("textbox", { name: /^Quantas vezes/ }), "0");
    await user.click(sheet.getByRole("button", { name: "Lançar e repetir" }));

    expect(await sheet.findByText(/Use um número de 1 a 600/)).toBeInTheDocument();
    expect(db.requests.recurrences).toEqual([]);
  });

  it("a tela lista as recorrentes e edita só o que mudou", async () => {
    db.recurrences = [
      recurrence(),
      recurrence({ id: "r2", description: "Geladeira", amount: 300, day_of_month: 5, occurrences: 10, auto_paid: true }),
      recurrence({ id: "r3", type: "income", description: "Salário", amount: 5000, category_id: "c2", day_of_month: 5, is_active: false }),
    ];
    const { user } = renderApp("/recorrentes", { loggedIn: true });

    const active = within(await screen.findByRole("list", { name: "Recorrentes ativas" }));
    expect(active.getAllByRole("listitem")).toHaveLength(2);
    expect(active.getByText(/Todo dia 10, sem fim/)).toBeInTheDocument();
    expect(active.getByText(/Todo dia 5, 10 vezes \(até ago\/2027\) · débito automático/)).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Recorrentes pausadas" })).getByText("Salário")).toBeInTheDocument();
    // Resumo do mês: só as ativas
    expect(screen.getByText(/Todo mês entra/)).toHaveTextContent(/entra \+ R\$\s0,00 e sai − R\$\s2\.100,00/);

    await user.click(active.getByRole("button", { name: /Aluguel/ }));
    const sheet = within(await screen.findByRole("dialog", { name: "Editar recorrente" }));
    const amount = sheet.getByRole("textbox", { name: "Valor" });
    await user.clear(amount);
    await user.type(amount, "1950");
    await user.click(sheet.getByRole("button", { name: "Salvar alterações" }));

    await expect.poll(() => db.requests.recurrences).toEqual([{ amount: 1950 }]);
  });

  it("pausa e exclui pela tela de edição", async () => {
    db.recurrences = [recurrence(), recurrence({ id: "r2", description: "Academia", amount: 90 })];
    const { user } = renderApp("/recorrentes", { loggedIn: true });

    await user.click(await screen.findByRole("button", { name: /Aluguel/ }));
    let sheet = within(await screen.findByRole("dialog", { name: "Editar recorrente" }));
    await user.click(sheet.getByRole("button", { name: "Pausar" }));
    await expect.poll(() => db.requests.recurrences).toEqual([{ is_active: false }]);

    await user.click(await screen.findByRole("button", { name: /Academia/ }));
    sheet = within(await screen.findByRole("dialog", { name: "Editar recorrente" }));
    await user.click(sheet.getByRole("button", { name: "Excluir" }));
    expect(sheet.getByText(/Os lançamentos futuros ainda não pagos saem junto/)).toBeInTheDocument();
    await user.click(sheet.getByRole("button", { name: "Confirmar exclusão" }));

    await expect.poll(() => db.requests.recurrences.at(-1)).toEqual({ deleted: "r2", query: "" });
  });

  it("\"Nova\" na tela de recorrentes abre o lançamento já repetindo", async () => {
    const { user } = renderApp("/recorrentes", { loggedIn: true });

    await user.click(await screen.findByRole("button", { name: "Nova" }));
    const sheet = within(await screen.findByRole("dialog", { name: "Novo lançamento" }));
    expect(sheet.getByRole("switch", { name: /Repetir todo mês/ })).toBeChecked();
    expect(sheet.getByRole("button", { name: "Lançar e repetir" })).toBeInTheDocument();
  });
});

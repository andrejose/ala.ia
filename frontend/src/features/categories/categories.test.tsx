import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Category, Transaction } from "../../lib/types";
import { renderApp } from "../../test/renderApp";
import { db } from "../../test/server";

const academia: Category = {
  id: "c3",
  household_id: "h1",
  name: "Academia",
  type: "expense",
  color: null,
  icon: null,
  is_active: false,
};

const mensalidade: Transaction = {
  id: "t1",
  household_id: "h1",
  type: "expense",
  description: "Mensalidade",
  amount: 120,
  account_id: "a1",
  destination_account_id: null,
  category_id: "c3",
  due_date: "2026-11-05",
  payment_date: "2026-11-05",
  user_id: "u1",
};

describe("Arquivar categorias", () => {
  it("arquiva uma categoria: ela sai da lista e fica em arquivadas", async () => {
    const { user } = renderApp("/categorias", { loggedIn: true });

    await user.click(await screen.findByRole("button", { name: "Mercado" }));
    const sheet = within(await screen.findByRole("dialog", { name: "Editar categoria" }));
    await user.click(sheet.getByRole("button", { name: "Arquivar categoria" }));

    const toggle = await screen.findByRole("button", { name: "Mostrar categorias arquivadas (1)" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(db.requests.categories).toEqual([{ is_active: false }]);
    expect(screen.getByText("Nenhuma categoria de despesa em uso.")).toBeInTheDocument();

    await user.click(toggle);
    const archived = within(screen.getByRole("group", { name: "Categorias arquivadas" }));
    expect(archived.getByRole("button", { name: "Mercado" })).toBeInTheDocument();
  });

  it("reativa uma categoria arquivada", async () => {
    db.categories.push({ ...academia });
    const { user } = renderApp("/categorias", { loggedIn: true });

    await user.click(await screen.findByRole("button", { name: "Mostrar categorias arquivadas (1)" }));
    await user.click(screen.getByRole("button", { name: "Academia" }));
    const sheet = within(await screen.findByRole("dialog", { name: "Editar categoria" }));
    await user.click(sheet.getByRole("button", { name: "Reativar categoria" }));

    await expect.poll(() => screen.queryByRole("button", { name: /categorias arquivadas/ })).toBeNull();
    expect(db.requests.categories).toEqual([{ is_active: true }]);
    expect(screen.getByRole("button", { name: "Academia" })).toBeInTheDocument();
  });

  it("ao tentar excluir uma categoria em uso, sugere arquivar", async () => {
    db.categories.push({ ...academia, is_active: true });
    db.transactions.push({ ...mensalidade });
    const { user } = renderApp("/categorias", { loggedIn: true });

    await user.click(await screen.findByRole("button", { name: "Academia" }));
    const sheet = within(await screen.findByRole("dialog", { name: "Editar categoria" }));
    await user.click(sheet.getByRole("button", { name: "Excluir" }));
    await user.click(sheet.getByRole("button", { name: "Confirmar exclusão" }));

    expect(await sheet.findByRole("alert")).toHaveTextContent("Arquive para tirá-la das listas sem perder o histórico.");
  });

  it("um lançamento novo não oferece categoria arquivada", async () => {
    db.categories.push({ ...academia });
    const { user } = renderApp("/", { loggedIn: true });

    const [button] = await screen.findAllByRole("button", { name: "Novo lançamento" });
    await user.click(button);
    const sheet = within(await screen.findByRole("dialog", { name: "Novo lançamento" }));

    expect(await sheet.findByRole("option", { name: "Mercado" })).toBeInTheDocument();
    expect(sheet.queryByRole("option", { name: "Academia" })).not.toBeInTheDocument();
  });

  it("um lançamento antigo continua mostrando a sua categoria arquivada", async () => {
    db.categories.push({ ...academia });
    db.transactions.push({ ...mensalidade });
    const { user } = renderApp("/", { loggedIn: true });

    await user.click(await screen.findByRole("button", { name: /Mensalidade/ }));
    const sheet = within(await screen.findByRole("dialog", { name: "Editar lançamento" }));

    const select = sheet.getByRole("combobox", { name: "Categoria" });
    expect(await within(select).findByRole("option", { name: "Academia" })).toBeInTheDocument();
    expect(select).toHaveValue("c3");
  });
});

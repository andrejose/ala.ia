import { act, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "../test/renderApp";
import { db } from "../test/server";

// Fechar um formulário com algo preenchido pede confirmação (X, fundo e Esc).
// Sem alterações, ou depois de salvar, fecha direto.

async function openNewTransaction() {
  const app = renderApp("/", { loggedIn: true });
  const [button] = await screen.findAllByRole("button", { name: "Novo lançamento" });
  await app.user.click(button);
  const dialog = await screen.findByRole("dialog", { name: "Novo lançamento" });
  await within(dialog).findByRole("option", { name: "Conta corrente" });
  return { ...app, dialog, sheet: within(dialog) };
}

function pressEscape(dialog: HTMLElement) {
  act(() => {
    dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
  });
}

describe("Fechar formulário sem salvar", () => {
  it("sem nada preenchido, fecha direto", async () => {
    const { user, sheet } = await openNewTransaction();

    await user.click(sheet.getByRole("button", { name: "Fechar" }));

    await expect.poll(() => screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("com algo preenchido, o X pede confirmação; continuar mantém o que foi digitado", async () => {
    const { user, sheet } = await openNewTransaction();

    await user.type(sheet.getByRole("textbox", { name: "Valor" }), "89,90");
    await user.type(sheet.getByRole("textbox", { name: "Descrição" }), "Feira");
    await user.click(sheet.getByRole("button", { name: "Fechar" }));

    const confirm = within(await screen.findByRole("alertdialog", { name: "Descartar o que você preencheu?" }));
    // "Continuar editando" vem focado: um Enter sem querer não apaga nada
    expect(confirm.getByRole("button", { name: "Continuar editando" })).toHaveFocus();
    await user.click(confirm.getByRole("button", { name: "Continuar editando" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(sheet.getByRole("textbox", { name: "Valor" })).toHaveValue("89,90");
    expect(sheet.getByRole("textbox", { name: "Descrição" })).toHaveValue("Feira");
  });

  it("clique no fundo e Esc também pedem confirmação; descartar fecha", async () => {
    const { user, dialog, sheet } = await openNewTransaction();

    await user.type(sheet.getByRole("textbox", { name: "Descrição" }), "Mercado");

    // Clique no fundo escurecido (o próprio <dialog>)
    fireEvent.click(dialog);
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continuar editando" }));

    // Esc
    pressEscape(dialog);
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    // Esc com a confirmação aberta só fecha a confirmação
    pressEscape(dialog);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(sheet.getByRole("textbox", { name: "Descrição" })).toHaveValue("Mercado");

    pressEscape(dialog);
    await user.click(await screen.findByRole("button", { name: "Descartar" }));
    await expect.poll(() => screen.queryByRole("dialog")).toBeNull();

    // Abrir de novo começa do zero
    const [button] = screen.getAllByRole("button", { name: "Novo lançamento" });
    await user.click(button);
    const again = within(await screen.findByRole("dialog", { name: "Novo lançamento" }));
    expect(again.getByRole("textbox", { name: "Descrição" })).toHaveValue("");
  });

  it("depois de salvar, fecha sem perguntar", async () => {
    const { user, sheet } = await openNewTransaction();

    await user.type(sheet.getByRole("textbox", { name: "Valor" }), "50");
    await user.type(sheet.getByRole("textbox", { name: "Descrição" }), "Padaria");
    await user.selectOptions(sheet.getByRole("combobox", { name: "Saiu de" }), "Conta corrente");
    await user.selectOptions(sheet.getByRole("combobox", { name: "Categoria" }), "Mercado");
    await user.click(sheet.getByRole("button", { name: "Lançar" }));

    await expect.poll(() => db.requests.transactions).toHaveLength(1);
    await expect.poll(() => screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("editando, só pergunta se algo mudou (vale para os outros formulários, como o de conta)", async () => {
    const { user } = renderApp("/contas", { loggedIn: true });

    await user.click(await screen.findByRole("button", { name: /Conta corrente/ }));
    let sheet = within(await screen.findByRole("dialog", { name: "Editar conta" }));
    await user.click(sheet.getByRole("button", { name: "Fechar" }));
    await expect.poll(() => screen.queryByRole("dialog")).toBeNull();

    await user.click(screen.getByRole("button", { name: /Conta corrente/ }));
    sheet = within(await screen.findByRole("dialog", { name: "Editar conta" }));
    await user.type(sheet.getByRole("textbox", { name: "Nome" }), " BB");
    await user.click(sheet.getByRole("button", { name: "Fechar" }));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
  });
});

describe("Fechar formulário sem salvar — navegador fechando à força", () => {
  it("se o navegador fechar o modal com algo preenchido, ele reabre com tudo e pergunta", async () => {
    const { user, dialog, sheet } = await openNewTransaction();

    await user.type(sheet.getByRole("textbox", { name: "Descrição" }), "Farmácia");
    // Como o Chrome faz num segundo Esc: fecha o <dialog> sem passar pelo "cancel"
    act(() => {
      (dialog as HTMLDialogElement).close();
    });

    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(dialog).toHaveAttribute("open");
    expect(sheet.getByRole("textbox", { name: "Descrição" })).toHaveValue("Farmácia");
  });
});

import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ImportRow } from "../../lib/types";
import { renderApp } from "../../test/renderApp";
import { db } from "../../test/server";

function row(description: string, amount: number, extra: Partial<ImportRow> = {}): ImportRow {
  return {
    line: 2,
    import_hash: description.toLowerCase().replace(/\W/g, "").padEnd(64, "0").slice(0, 64),
    date: "2026-11-03",
    description,
    amount,
    type: "expense",
    category_id: null,
    status: "new",
    selected: true,
    note: null,
    ...extra,
  };
}

function setPreview(rows: ImportRow[], extra: { kind_mismatch?: boolean; kind?: "checking" | "credit_card" } = {}) {
  db.importPreview = {
    source: { id: "bb-csv", label: "Banco do Brasil (CSV)", kind: extra.kind ?? "checking" },
    kind_mismatch: extra.kind_mismatch ?? false,
    summary: {
      total: rows.length,
      new: rows.filter((r) => r.status === "new").length,
      imported: rows.filter((r) => r.status === "imported").length,
      similar: rows.filter((r) => r.status === "similar").length,
    },
    rows,
  };
}

// Abre a importação pela tela de lançamentos e lê um arquivo na conta corrente
async function readFile() {
  const app = renderApp("/lancamentos", { loggedIn: true });
  await app.user.click(await screen.findByRole("link", { name: "Importar" }));
  expect(await screen.findByRole("heading", { name: "Importar extrato" })).toBeInTheDocument();

  const account = screen.getByRole("combobox", { name: /^Conta/ });
  await within(account).findByRole("option", { name: "Conta corrente" });
  await app.user.selectOptions(account, "Conta corrente");
  const file = new File(['"Data","Lançamento"\n'], "extrato.csv", { type: "text/csv" });
  await app.user.upload(screen.getByLabelText("Arquivo do extrato"), file);
  await app.user.click(screen.getByRole("button", { name: "Ler arquivo" }));
  return app;
}

describe("Importar extrato", () => {
  it("lê o arquivo, mostra a prévia e grava as linhas marcadas com as categorias", async () => {
    setPreview([
      row("PADARIA PAO QUENTE", 39.99, { category_id: "c1" }),
      row("Pix - Enviado · PIZZARIA BELLA", 66),
      row("BB Rende Fácil", 1306.55, { type: "income", selected: false, note: "Aplicação ou resgate automático." }),
      row("Mercado da semana", 120, { status: "imported", selected: false, note: "Já importado antes." }),
      row("Pix - Recebido · EMPRESA", 2500, { type: "income", category_id: "c2", date: "2026-11-05" }),
    ]);
    const { user } = await readFile();

    const list = within(await screen.findByRole("list", { name: "Lançamentos do arquivo" }));
    expect(db.requests.importFiles).toEqual([{ account_id: "a1", text: '"Data","Lançamento"\n' }]);
    expect(screen.getByText("5 lançamentos no arquivo")).toBeInTheDocument();
    expect(screen.getByText("1 já importados antes")).toBeInTheDocument();

    // Desmarcada com o motivo; a já importada nem pode ser marcada
    expect(list.getByRole("checkbox", { name: /BB Rende Fácil/ })).not.toBeChecked();
    expect(list.getByText("Aplicação ou resgate automático.")).toBeInTheDocument();
    expect(list.getByRole("checkbox", { name: /Mercado da semana/ })).toBeDisabled();

    // Uma despesa marcada está sem categoria: escolhe para todas de uma vez
    await user.selectOptions(screen.getByRole("combobox", { name: "Despesas sem categoria" }), "Mercado");
    expect(list.getByRole("combobox", { name: /Categoria de Pix - Enviado/ })).toHaveValue("c1");

    await user.click(screen.getByRole("button", { name: "Importar 3" }));

    expect(await screen.findByRole("status")).toHaveTextContent("3 lançamentos importados");
    expect(db.requests.imports).toEqual([
      {
        account_id: "a1",
        rows: [
          expect.objectContaining({ description: "PADARIA PAO QUENTE", amount: 39.99, type: "expense", category_id: "c1" }),
          expect.objectContaining({ description: "Pix - Enviado · PIZZARIA BELLA", amount: 66, type: "expense", category_id: "c1" }),
          expect.objectContaining({ description: "Pix - Recebido · EMPRESA", date: "2026-11-05", type: "income", category_id: "c2" }),
        ],
      },
    ]);
    expect(screen.getByRole("link", { name: "Ver lançamentos" })).toHaveAttribute("href", "/lancamentos");
  });

  it("não grava enquanto houver linha marcada sem categoria", async () => {
    setPreview([row("Loja sem categoria", 10)]);
    const { user } = await readFile();

    await screen.findByRole("list", { name: "Lançamentos do arquivo" });
    await user.click(screen.getByRole("button", { name: "Importar 1" }));

    expect(await screen.findByText("Escolha a categoria de 1 linha marcada.")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /Categoria de Loja sem categoria/ })).toHaveAttribute("aria-invalid", "true");
    expect(db.requests.imports).toEqual([]);

    // Desmarcar a linha também resolve: não há o que importar
    await user.click(screen.getByRole("checkbox", { name: /Loja sem categoria/ }));
    expect(screen.getByRole("button", { name: "Importar 0" })).toBeDisabled();
  });

  it("o IOF acompanha a categoria escolhida para a compra, até ganhar uma própria", async () => {
    db.categories.push({ id: "c3", household_id: "h1", name: "Assinaturas", type: "expense", color: null, icon: null, is_active: true });
    const purchase = row("Assinatura Exemplo", 114.4);
    setPreview([purchase, row('IOF de "Assinatura Exemplo"', 4, { follows: purchase.import_hash }), row("Posto", 100)]);
    const { user } = await readFile();

    const list = within(await screen.findByRole("list", { name: "Lançamentos do arquivo" }));
    const category = (name: RegExp) => list.getByRole("combobox", { name });

    await user.selectOptions(category(/^Categoria de Assinatura Exemplo/), "Assinaturas");
    expect(category(/^Categoria de IOF de/)).toHaveValue("c3");
    // Outras linhas não mudam
    expect(category(/^Categoria de Posto/)).toHaveValue("");

    // Depois que o IOF ganha uma categoria própria, ele não acompanha mais
    await user.selectOptions(category(/^Categoria de IOF de/), "Mercado");
    await user.selectOptions(category(/^Categoria de Assinatura Exemplo/), "Mercado");
    await user.selectOptions(category(/^Categoria de Assinatura Exemplo/), "Assinaturas");
    expect(category(/^Categoria de IOF de/)).toHaveValue("c1");
  });

  it("avisa quando a fatura de cartão vai para uma conta que não é cartão", async () => {
    setPreview([row("Posto", 100, { category_id: "c1" })], { kind: "credit_card", kind_mismatch: true });
    await readFile();

    expect(await screen.findByRole("alert")).toHaveTextContent("é a fatura de um cartão");
  });

  it("mostra o erro quando o arquivo não é reconhecido", async () => {
    db.importPreview = null;
    await readFile();

    expect(await screen.findByText("Não reconheci este arquivo.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Lançamentos do arquivo" })).not.toBeInTheDocument();
  });
});

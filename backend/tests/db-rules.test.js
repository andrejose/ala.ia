import { beforeAll, describe, expect, it } from "vitest";
import { createUserClient } from "../src/lib/supabase.js";
import { createAccount, createCategory, createTestUser } from "./helpers/users.js";

// Regras garantidas pelo próprio banco, testadas falando direto com o
// Supabase (sem passar pela API), como faria quem usasse o supabase-js direto.

let ana;
let bruno;
let account;
let category;

beforeAll(async () => {
  ana = await createTestUser({ name: "Ana Regras" });
  bruno = await createTestUser({ name: "Bruno Regras" });
  account = await createAccount(ana);
  category = await createCategory(ana, { type: "expense" });
});

describe("Autor do lançamento (trigger set_transaction_author)", () => {
  it("grava sempre o usuário logado, mesmo se outro user_id for enviado", async () => {
    const db = createUserClient(ana.accessToken);
    const { data, error } = await db
      .from("transactions")
      .insert({
        household_id: ana.householdId,
        type: "expense",
        description: "Tentando lançar em nome de outra pessoa",
        amount: 10,
        account_id: account.id,
        category_id: category.id,
        user_id: bruno.id,
      })
      .select("id, user_id")
      .single();

    expect(error).toBeNull();
    expect(data.user_id).toBe(ana.id);
  });

  it("não deixa trocar o autor depois", async () => {
    const db = createUserClient(ana.accessToken);
    const { data: created } = await db
      .from("transactions")
      .insert({
        household_id: ana.householdId,
        type: "expense",
        description: "Autor fixo",
        amount: 5,
        account_id: account.id,
        category_id: category.id,
      })
      .select("id")
      .single();

    const { data, error } = await db
      .from("transactions")
      .update({ user_id: bruno.id, description: "Autor fixo (editado)" })
      .eq("id", created.id)
      .select("user_id, description")
      .single();

    expect(error).toBeNull();
    expect(data).toEqual({ user_id: ana.id, description: "Autor fixo (editado)" });
  });
});

describe("RLS direto no banco", () => {
  it("outro usuário não lê nem grava lançamentos no espaço alheio", async () => {
    const db = createUserClient(bruno.accessToken);

    const { data: rows } = await db.from("transactions").select("id").eq("household_id", ana.householdId);
    expect(rows).toEqual([]);

    const { error } = await db.from("transactions").insert({
      household_id: ana.householdId,
      type: "expense",
      description: "Intruso",
      amount: 1,
      account_id: account.id,
      category_id: category.id,
    });
    expect(error?.code).toBe("42501");
  });
});

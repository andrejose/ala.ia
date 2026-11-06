import { HttpError } from "../errors/HttpError.js";

// Contas do household. A leitura usa a view account_balances, que já traz o
// saldo atual (initial_balance + lançamentos pagos).

const balanceColumns = "account_id, household_id, name, type, is_active, initial_balance, current_balance";

function toAccountDto({ account_id, ...rest }) {
  return { id: account_id, ...rest };
}

async function getAccountWithBalance(supabase, householdId, id) {
  const { data, error } = await supabase
    .from("account_balances")
    .select(balanceColumns)
    .eq("household_id", householdId)
    .eq("account_id", id)
    .single();
  if (error) throw error;

  return toAccountDto(data);
}

// GET /households/:householdId/accounts
export async function list(req, res) {
  let query = req.supabase
    .from("account_balances")
    .select(balanceColumns)
    .eq("household_id", req.household.id)
    .order("name");

  const { is_active } = req.validated.query;
  if (is_active !== undefined) query = query.eq("is_active", is_active);

  const { data, error } = await query;
  if (error) throw error;

  res.status(200).json(data.map(toAccountDto));
}

// GET /households/:householdId/accounts/:id
export async function get(req, res) {
  res.status(200).json(await getAccountWithBalance(req.supabase, req.household.id, req.validated.params.id));
}

// POST /households/:householdId/accounts
export async function create(req, res) {
  const { data, error } = await req.supabase
    .from("accounts")
    .insert({ ...req.validated.body, household_id: req.household.id })
    .select("id")
    .single();
  if (error) throw error;

  res.status(201).json(await getAccountWithBalance(req.supabase, req.household.id, data.id));
}

// PATCH /households/:householdId/accounts/:id — também arquiva (is_active: false)
export async function update(req, res) {
  const { id } = req.validated.params;

  const { error } = await req.supabase
    .from("accounts")
    .update(req.validated.body)
    .eq("household_id", req.household.id)
    .eq("id", id)
    .select("id")
    .single();
  if (error) throw error;

  res.status(200).json(await getAccountWithBalance(req.supabase, req.household.id, id));
}

// DELETE /households/:householdId/accounts/:id
export async function remove(req, res) {
  const { error } = await req.supabase
    .from("accounts")
    .delete()
    .eq("household_id", req.household.id)
    .eq("id", req.validated.params.id)
    .select("id")
    .single();

  if (error?.code === "23503") {
    throw new HttpError(
      409,
      "RESOURCE_IN_USE",
      "A conta tem lançamentos e não pode ser excluída. Arquive-a com PATCH { \"is_active\": false }."
    );
  }
  if (error) throw error;

  res.status(204).end();
}

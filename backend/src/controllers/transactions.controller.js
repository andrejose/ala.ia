import { HttpError } from "../errors/HttpError.js";
import { transactionRuleIssues } from "../schemas/transactions.schemas.js";

const columns =
  "id, household_id, type, description, amount, account_id, destination_account_id, category_id, " +
  "due_date, payment_date, user_id, created_at, updated_at";

async function getTransaction(supabase, householdId, id) {
  const { data, error } = await supabase
    .from("transactions")
    .select(columns)
    .eq("household_id", householdId)
    .eq("id", id)
    .single();
  if (error) throw error;

  return data;
}

// GET /households/:householdId/transactions
export async function list(req, res) {
  const { type, account_id, category_id, from, to, status, limit, offset } = req.validated.query;

  let query = req.supabase
    .from("transactions")
    .select(columns, { count: "exact" })
    .eq("household_id", req.household.id);

  if (type) query = query.eq("type", type);
  // account_id já foi validado como UUID, então é seguro no filtro "or"
  if (account_id) query = query.or(`account_id.eq.${account_id},destination_account_id.eq.${account_id}`);
  if (category_id) query = query.eq("category_id", category_id);
  if (from) query = query.gte("due_date", from);
  if (to) query = query.lte("due_date", to);
  if (status === "paid") query = query.not("payment_date", "is", null);
  if (status === "pending") query = query.is("payment_date", null);

  const { data, count, error } = await query
    .order("due_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;

  res.status(200).json({ data, pagination: { total: count, limit, offset } });
}

// GET /households/:householdId/transactions/:id
export async function get(req, res) {
  res.status(200).json(await getTransaction(req.supabase, req.household.id, req.validated.params.id));
}

// POST /households/:householdId/transactions
export async function create(req, res) {
  const { data, error } = await req.supabase
    .from("transactions")
    .insert({ ...req.validated.body, household_id: req.household.id, user_id: req.user.id })
    .select(columns)
    .single();
  if (error) throw error;

  res.status(201).json(data);
}

// PATCH /households/:householdId/transactions/:id
// As regras dependem da combinação de campos (ex.: mudar para transfer exige
// destino e remover a categoria), então valida o lançamento já mesclado.
export async function update(req, res) {
  const { id } = req.validated.params;
  const changes = req.validated.body;

  const current = await getTransaction(req.supabase, req.household.id, id);
  const issues = transactionRuleIssues({ ...current, ...changes });
  if (issues.length > 0) {
    throw new HttpError(400, "VALIDATION_ERROR", "Dados inválidos.", issues.map((issue) => ({ in: "body", ...issue })));
  }

  const { data, error } = await req.supabase
    .from("transactions")
    .update(changes)
    .eq("household_id", req.household.id)
    .eq("id", id)
    .select(columns)
    .single();
  if (error) throw error;

  res.status(200).json(data);
}

// DELETE /households/:householdId/transactions/:id
export async function remove(req, res) {
  const { error } = await req.supabase
    .from("transactions")
    .delete()
    .eq("household_id", req.household.id)
    .eq("id", req.validated.params.id)
    .select("id")
    .single();
  if (error) throw error;

  res.status(204).end();
}

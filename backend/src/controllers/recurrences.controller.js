import { HttpError } from "../errors/HttpError.js";
import { GENERATION_FIELDS } from "../schemas/recurrences.schemas.js";
import { transactionRuleIssues } from "../schemas/transactions.schemas.js";

// Lançamentos recorrentes. A regra fica em "recurrences"; os lançamentos de
// cada mês são gerados pela função materialize_recurrences do banco, chamada
// ao criar ou alterar uma regra e por POST /recurrences/materialize (o app
// chama ao abrir).

const columns =
  "id, household_id, type, description, amount, account_id, destination_account_id, category_id, " +
  "day_of_month, start_month, occurrences, auto_paid, is_active, generated_until, user_id, created_at, updated_at";

// start_month e generated_until saem como "YYYY-MM", como entram
function toDto(row) {
  return {
    ...row,
    start_month: row.start_month.slice(0, 7),
    generated_until: row.generated_until?.slice(0, 7) ?? null,
  };
}

async function getRecurrence(supabase, householdId, id) {
  const { data, error } = await supabase
    .from("recurrences")
    .select(columns)
    .eq("household_id", householdId)
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

async function materialize(supabase, householdId) {
  const { data, error } = await supabase.rpc("materialize_recurrences", { p_household_id: householdId });
  if (error) throw error;
  return data;
}

// Datas no mesmo relógio do banco (current_date é UTC no Supabase)
function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function previousMonthUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
}

// Apaga os lançamentos gerados que ainda não aconteceram nem foram pagos
async function removeFuturePending(supabase, householdId, id) {
  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("household_id", householdId)
    .eq("recurrence_id", id)
    .is("payment_date", null)
    .gte("due_date", todayUtc());
  if (error) throw error;
}

async function setGeneratedUntil(supabase, householdId, id, value) {
  const { error } = await supabase
    .from("recurrences")
    .update({ generated_until: value })
    .eq("household_id", householdId)
    .eq("id", id);
  if (error) throw error;
}

// GET /households/:householdId/recurrences
export async function list(req, res) {
  const { data, error } = await req.supabase
    .from("recurrences")
    .select(columns)
    .eq("household_id", req.household.id)
    .order("is_active", { ascending: false })
    .order("description");
  if (error) throw error;

  res.status(200).json(data.map(toDto));
}

// GET /households/:householdId/recurrences/:id
export async function get(req, res) {
  res.status(200).json(toDto(await getRecurrence(req.supabase, req.household.id, req.validated.params.id)));
}

// POST /households/:householdId/recurrences — cria a regra e já gera os meses
export async function create(req, res) {
  const { data, error } = await req.supabase
    .from("recurrences")
    .insert({ ...req.validated.body, household_id: req.household.id, user_id: req.user.id })
    .select("id")
    .single();
  if (error) throw error;

  const generated = await materialize(req.supabase, req.household.id);
  const recurrence = await getRecurrence(req.supabase, req.household.id, data.id);
  res.status(201).json({ ...toDto(recurrence), generated });
}

// PATCH /households/:householdId/recurrences/:id
// Mudar valor, dia, conta... refaz os lançamentos futuros ainda pendentes (os
// já pagos e os atrasados ficam como estão). Pausar para de gerar; reativar
// volta a gerar a partir do mês atual, sem preencher os meses pausados.
export async function update(req, res) {
  const { id } = req.validated.params;
  const changes = req.validated.body;
  const householdId = req.household.id;

  const current = await getRecurrence(req.supabase, householdId, id);
  const issues = transactionRuleIssues({ ...current, ...changes });
  if (issues.length > 0) {
    throw new HttpError(400, "VALIDATION_ERROR", "Dados inválidos.", issues.map((issue) => ({ in: "body", ...issue })));
  }

  const { error } = await req.supabase.from("recurrences").update(changes).eq("household_id", householdId).eq("id", id);
  if (error) throw error;

  const previousMonth = previousMonthUtc();
  const regenerate = GENERATION_FIELDS.some((field) => field in changes && changes[field] !== current[field]);
  const reactivated = changes.is_active === true && !current.is_active;
  const paused = changes.is_active === false && current.is_active;

  // Pausar também tira os pendentes futuros: a regra não vale mais daqui para frente
  if (regenerate || paused) {
    await removeFuturePending(req.supabase, householdId, id);
    if (current.generated_until && current.generated_until > previousMonth) {
      await setGeneratedUntil(req.supabase, householdId, id, previousMonth);
    }
  }
  if (reactivated && (!current.generated_until || current.generated_until < previousMonth)) {
    await setGeneratedUntil(req.supabase, householdId, id, previousMonth);
  }

  const generated = await materialize(req.supabase, householdId);
  res.status(200).json({ ...toDto(await getRecurrence(req.supabase, householdId, id)), generated });
}

// DELETE /households/:householdId/recurrences/:id?remove_pending=true
// Os lançamentos já gerados ficam (sem o vínculo); por padrão, os futuros
// ainda pendentes saem junto.
export async function remove(req, res) {
  const { id } = req.validated.params;
  await getRecurrence(req.supabase, req.household.id, id);
  if (req.validated.query.remove_pending) await removeFuturePending(req.supabase, req.household.id, id);

  const { error } = await req.supabase
    .from("recurrences")
    .delete()
    .eq("household_id", req.household.id)
    .eq("id", id)
    .select("id")
    .single();
  if (error) throw error;

  res.status(204).end();
}

// POST /households/:householdId/recurrences/materialize
export async function materializeAll(req, res) {
  res.status(200).json({ generated: await materialize(req.supabase, req.household.id) });
}

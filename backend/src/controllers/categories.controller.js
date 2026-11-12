import { HttpError } from "../errors/HttpError.js";

const columns = "id, household_id, name, type, color, icon, is_active, created_at, updated_at";

// GET /households/:householdId/categories
export async function list(req, res) {
  let query = req.supabase
    .from("categories")
    .select(columns)
    .eq("household_id", req.household.id)
    .order("type")
    .order("name");

  const { type, is_active } = req.validated.query;
  if (type) query = query.eq("type", type);
  if (is_active !== undefined) query = query.eq("is_active", is_active);

  const { data, error } = await query;
  if (error) throw error;

  res.status(200).json(data);
}

// GET /households/:householdId/categories/:id
export async function get(req, res) {
  const { data, error } = await req.supabase
    .from("categories")
    .select(columns)
    .eq("household_id", req.household.id)
    .eq("id", req.validated.params.id)
    .single();
  if (error) throw error;

  res.status(200).json(data);
}

function categoryConflict(error) {
  if (error?.code === "23505") {
    return new HttpError(409, "CONFLICT", "Já existe uma categoria com esse nome e tipo neste household.");
  }
  if (error?.code === "23503") {
    return new HttpError(
      409,
      "RESOURCE_IN_USE",
      "A categoria tem lançamentos: não pode ser excluída nem mudar de tipo. Para tirá-la das listas, arquive-a com PATCH { \"is_active\": false }."
    );
  }
  return error;
}

// POST /households/:householdId/categories
export async function create(req, res) {
  const { data, error } = await req.supabase
    .from("categories")
    .insert({ ...req.validated.body, household_id: req.household.id })
    .select(columns)
    .single();
  if (error) throw categoryConflict(error);

  res.status(201).json(data);
}

// PATCH /households/:householdId/categories/:id — também arquiva (is_active: false)
export async function update(req, res) {
  const { data, error } = await req.supabase
    .from("categories")
    .update(req.validated.body)
    .eq("household_id", req.household.id)
    .eq("id", req.validated.params.id)
    .select(columns)
    .single();
  if (error) throw categoryConflict(error);

  res.status(200).json(data);
}

// DELETE /households/:householdId/categories/:id
export async function remove(req, res) {
  const { error } = await req.supabase
    .from("categories")
    .delete()
    .eq("household_id", req.household.id)
    .eq("id", req.validated.params.id)
    .select("id")
    .single();
  if (error) throw categoryConflict(error);

  res.status(204).end();
}

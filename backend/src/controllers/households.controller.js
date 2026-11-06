import { HttpError } from "../errors/HttpError.js";

// Households e membros. O household de :householdId já vem carregado em
// req.household pelo middleware loadHousehold (com o papel do usuário).

const memberColumns = "user_id, role, created_at, profiles (name)";

function toMemberDto({ user_id, role, created_at, profiles }) {
  return { user_id, name: profiles?.name ?? null, role, joined_at: created_at };
}

// Households do usuário com o papel em cada um (usado também por GET /me)
export async function listUserHouseholds(supabase, userId) {
  const { data, error } = await supabase
    .from("household_members")
    .select("role, households!inner (id, name, created_at, updated_at)")
    .eq("user_id", userId)
    .order("created_at");
  if (error) throw error;

  return data.map(({ role, households }) => ({ ...households, role }));
}

// GET /households
export async function list(req, res) {
  res.status(200).json(await listUserHouseholds(req.supabase, req.user.id));
}

// POST /households — o usuário vira dono do novo household
export async function create(req, res) {
  const { data: id, error } = await req.supabase.rpc("create_household", {
    p_name: req.validated.body.name,
  });
  if (error) throw error;

  const { data: household, error: selectError } = await req.supabase
    .from("households")
    .select("id, name, created_at, updated_at")
    .eq("id", id)
    .single();
  if (selectError) throw selectError;

  res.status(201).json({ ...household, role: "owner" });
}

// GET /households/:householdId
export async function get(req, res) {
  res.status(200).json(req.household);
}

// PATCH /households/:householdId (owner)
export async function update(req, res) {
  const { data, error } = await req.supabase
    .from("households")
    .update(req.validated.body)
    .eq("id", req.household.id)
    .select("id, name, created_at, updated_at")
    .single();
  if (error) throw error;

  res.status(200).json({ ...data, role: req.household.role });
}

// DELETE /households/:householdId (owner) — apaga contas, categorias e lançamentos em cascata
export async function remove(req, res) {
  const { error } = await req.supabase
    .from("households")
    .delete()
    .eq("id", req.household.id)
    .select("id")
    .single();
  if (error) throw error;

  res.status(204).end();
}

// GET /households/:householdId/members
export async function listMembers(req, res) {
  const { data, error } = await req.supabase
    .from("household_members")
    .select(memberColumns)
    .eq("household_id", req.household.id)
    .order("created_at");
  if (error) throw error;

  res.status(200).json(data.map(toMemberDto));
}

async function getMember(supabase, householdId, userId) {
  const { data, error } = await supabase
    .from("household_members")
    .select(memberColumns)
    .eq("household_id", householdId)
    .eq("user_id", userId)
    .single();
  if (error) throw error;

  return toMemberDto(data);
}

// POST /households/:householdId/members (owner) — adiciona um usuário já cadastrado
export async function addMember(req, res) {
  const { email, role } = req.validated.body;

  const { data: userId, error } = await req.supabase.rpc("invite_member", {
    p_household_id: req.household.id,
    p_email: email,
    p_role: role,
  });
  if (error) throw error;

  res.status(201).json(await getMember(req.supabase, req.household.id, userId));
}

// PATCH /households/:householdId/members/:userId (owner)
export async function updateMember(req, res) {
  const { userId } = req.validated.params;

  const { data, error } = await req.supabase
    .from("household_members")
    .update(req.validated.body)
    .eq("household_id", req.household.id)
    .eq("user_id", userId)
    .select(memberColumns)
    .single();
  if (error) throw error;

  res.status(200).json(toMemberDto(data));
}

// DELETE /households/:householdId/members/:userId
// O dono remove qualquer membro; um membro só pode remover a si mesmo (sair).
export async function removeMember(req, res) {
  const { userId } = req.validated.params;

  if (req.household.role !== "owner" && userId !== req.user.id) {
    throw new HttpError(403, "FORBIDDEN", "Apenas o dono pode remover outros membros. Você pode remover apenas a si mesmo.");
  }

  const { error } = await req.supabase
    .from("household_members")
    .delete()
    .eq("household_id", req.household.id)
    .eq("user_id", userId)
    .select("user_id")
    .single();
  if (error) throw error;

  res.status(204).end();
}

import { listUserHouseholds } from "./households.controller.js";

// Perfil do usuário logado. Todas as consultas usam req.supabase (RLS do usuário).

const profileColumns = "id, name, created_at, updated_at";

// GET /me
export async function getMe(req, res) {
  const { data: profile, error } = await req.supabase
    .from("profiles")
    .select(profileColumns)
    .eq("id", req.user.id)
    .single();
  if (error) throw error;

  const households = await listUserHouseholds(req.supabase, req.user.id);

  res.status(200).json({ ...profile, email: req.user.email, households });
}

// PATCH /me
export async function updateMe(req, res) {
  const { data: profile, error } = await req.supabase
    .from("profiles")
    .update(req.validated.body)
    .eq("id", req.user.id)
    .select(profileColumns)
    .single();
  if (error) throw error;

  const households = await listUserHouseholds(req.supabase, req.user.id);

  res.status(200).json({ ...profile, email: req.user.email, households });
}

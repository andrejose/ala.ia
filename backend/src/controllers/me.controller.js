// Perfil do usuário logado. Todas as consultas usam req.supabase (RLS do usuário).

async function loadHouseholds(supabase, userId) {
  const { data, error } = await supabase
    .from("household_members")
    .select("role, households (id, name)")
    .eq("user_id", userId)
    .order("created_at");
  if (error) throw error;

  return data.map(({ role, households }) => ({ ...households, role }));
}

// GET /me
export async function getMe(req, res) {
  const { data: profile, error } = await req.supabase
    .from("profiles")
    .select("id, name, created_at, updated_at")
    .eq("id", req.user.id)
    .single();
  if (error) throw error;

  const households = await loadHouseholds(req.supabase, req.user.id);

  res.status(200).json({ ...profile, email: req.user.email, households });
}

// PATCH /me
export async function updateMe(req, res) {
  const { data: profile, error } = await req.supabase
    .from("profiles")
    .update(req.validated.body)
    .eq("id", req.user.id)
    .select("id, name, created_at, updated_at")
    .single();
  if (error) throw error;

  const households = await loadHouseholds(req.supabase, req.user.id);

  res.status(200).json({ ...profile, email: req.user.email, households });
}

// Convites para households (fluxo em 09_invitations.sql):
//   o dono convida -> a pessoa aceita ou recusa -> o dono pode cancelar antes.

const invitationColumns = "id, household_id, email, role, status, created_at, expires_at, invited_by, profiles (name)";

function toInvitationDto({ profiles, invited_by, ...rest }) {
  return { ...rest, invited_by: invited_by ? { user_id: invited_by, name: profiles?.name ?? null } : null };
}

// ---------------------------------------------------------------------------
// Do lado do household: /households/:householdId/invitations
// ---------------------------------------------------------------------------

// GET — convites pendentes e ainda válidos do household
export async function listForHousehold(req, res) {
  const { data, error } = await req.supabase
    .from("household_invitations")
    .select(invitationColumns)
    .eq("household_id", req.household.id)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) throw error;

  res.status(200).json(data.map(toInvitationDto));
}

// POST (dono) — convida um e-mail, com ou sem cadastro
export async function create(req, res) {
  const { email, role } = req.validated.body;

  const { data: id, error } = await req.supabase.rpc("invite_member", {
    p_household_id: req.household.id,
    p_email: email,
    p_role: role,
  });
  if (error) throw error;

  const { data, error: selectError } = await req.supabase
    .from("household_invitations")
    .select(invitationColumns)
    .eq("id", id)
    .single();
  if (selectError) throw selectError;

  res.status(201).json(toInvitationDto(data));
}

// DELETE (dono) — cancela um convite pendente
export async function cancel(req, res) {
  const { error } = await req.supabase.rpc("cancel_invitation", {
    p_invitation_id: req.validated.params.invitationId,
  });
  if (error) throw error;

  res.status(204).end();
}

// ---------------------------------------------------------------------------
// Do lado de quem foi convidado: /invitations
// ---------------------------------------------------------------------------

// GET — convites pendentes para o e-mail do usuário logado
export async function listMine(req, res) {
  const { data, error } = await req.supabase.rpc("my_invitations");
  if (error) throw error;

  res.status(200).json(
    data.map(({ invited_by, ...rest }) => ({ ...rest, invited_by_name: invited_by }))
  );
}

// POST /:invitationId/accept — entra no household
export async function accept(req, res) {
  const { data: householdId, error } = await req.supabase.rpc("accept_invitation", {
    p_invitation_id: req.validated.params.invitationId,
  });
  if (error) throw error;

  const { data, error: selectError } = await req.supabase
    .from("household_members")
    .select("role, households!inner (id, name, created_at, updated_at)")
    .eq("household_id", householdId)
    .eq("user_id", req.user.id)
    .single();
  if (selectError) throw selectError;

  res.status(200).json({ ...data.households, role: data.role });
}

// POST /:invitationId/decline
export async function decline(req, res) {
  const { error } = await req.supabase.rpc("decline_invitation", {
    p_invitation_id: req.validated.params.invitationId,
  });
  if (error) throw error;

  res.status(204).end();
}

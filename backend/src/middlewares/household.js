import { HttpError } from "../errors/HttpError.js";

// Carrega o household de :householdId com o papel do usuário logado.
// 404 se o household não existe OU se o usuário não é membro (o RLS esconde),
// para não revelar a existência de households de outras pessoas.
//   req.household -> { id, name, role, created_at, updated_at }
export async function loadHousehold(req, res, next) {
  const { householdId } = req.validated.params;

  const { data, error } = await req.supabase
    .from("household_members")
    .select("role, households!inner (id, name, created_at, updated_at)")
    .eq("household_id", householdId)
    .eq("user_id", req.user.id)
    .maybeSingle();
  if (error) throw error;

  if (!data) {
    throw new HttpError(404, "NOT_FOUND", "Household não encontrado.");
  }

  req.household = { ...data.households, role: data.role };
  next();
}

// Restringe a rota ao dono (owner) do household carregado por loadHousehold
export function requireOwner(req, res, next) {
  if (req.household?.role !== "owner") {
    throw new HttpError(403, "FORBIDDEN", "Apenas o dono do household pode fazer esta operação.");
  }
  next();
}

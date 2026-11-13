// Orçamento por categoria: um limite mensal por categoria de despesa. O gasto
// vem de report_budgets() (11_budgets.sql), com a mesma conta do relatório por
// categoria: mês do vencimento, pendentes incluídos, transferências fora.

const round = (value) => Math.round(Number(value) * 100) / 100;

// GET /households/:householdId/budgets?month=YYYY-MM
export async function list(req, res) {
  const { month } = req.validated.query;

  const { data, error } = await req.supabase.rpc("report_budgets", {
    p_household_id: req.household.id,
    p_month: month,
  });
  if (error) throw error;

  const budgets = data.map((row) => {
    const amount = round(row.amount);
    const spent = round(row.spent);
    return {
      category_id: row.category_id,
      name: row.name,
      color: row.color,
      icon: row.icon,
      is_active: row.is_active,
      amount,
      spent,
      paid: round(row.paid),
      pending: round(row.pending),
      remaining: round(amount - spent),
      percent: Math.round((spent / amount) * 100),
    };
  });

  const amount = round(budgets.reduce((sum, b) => sum + b.amount, 0));
  const spent = round(budgets.reduce((sum, b) => sum + b.spent, 0));
  res.status(200).json({ month: month.slice(0, 7), total: { amount, spent, remaining: round(amount - spent) }, budgets });
}

// PUT /households/:householdId/budgets/:categoryId — define ou troca o limite
export async function upsert(req, res) {
  const { data, error } = await req.supabase
    .from("budgets")
    .upsert(
      { household_id: req.household.id, category_id: req.validated.params.categoryId, amount: req.validated.body.amount },
      { onConflict: "household_id,category_id" }
    )
    .select("category_id, amount, updated_at")
    .single();
  if (error) throw error;

  res.status(200).json(data);
}

// DELETE /households/:householdId/budgets/:categoryId — tira o limite
export async function remove(req, res) {
  const { error } = await req.supabase
    .from("budgets")
    .delete()
    .eq("household_id", req.household.id)
    .eq("category_id", req.validated.params.categoryId)
    .select("id")
    .single();
  if (error) throw error;

  res.status(204).end();
}

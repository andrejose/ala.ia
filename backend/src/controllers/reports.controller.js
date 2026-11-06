// Relatórios: funções report_* do banco (08_reports.sql), com o RLS do usuário.

const round = (value) => Math.round(Number(value) * 100) / 100;

// GET /households/:householdId/reports/summary?month=YYYY-MM
export async function summary(req, res) {
  const { month } = req.validated.query;

  const { data, error } = await req.supabase
    .rpc("report_monthly_summary", { p_household_id: req.household.id, p_month: month })
    .single();
  if (error) throw error;

  const income = { paid: round(data.income_paid), pending: round(data.income_pending) };
  const expense = { paid: round(data.expense_paid), pending: round(data.expense_pending) };
  income.total = round(income.paid + income.pending);
  expense.total = round(expense.paid + expense.pending);

  res.status(200).json({
    month: month.slice(0, 7),
    income,
    expense,
    balance: {
      paid: round(income.paid - expense.paid),
      total: round(income.total - expense.total),
    },
  });
}

// GET /households/:householdId/reports/by-category?month=YYYY-MM&type=expense
export async function byCategory(req, res) {
  const { month, type } = req.validated.query;

  const { data, error } = await req.supabase.rpc("report_by_category", {
    p_household_id: req.household.id,
    p_month: month,
    p_type: type,
  });
  if (error) throw error;

  const categories = data.map((row) => ({
    category_id: row.category_id,
    name: row.name,
    color: row.color,
    icon: row.icon,
    total: round(row.total),
    paid: round(row.paid),
    pending: round(row.pending),
    transaction_count: Number(row.transaction_count),
  }));

  res.status(200).json({
    month: month.slice(0, 7),
    type,
    total: round(categories.reduce((sum, c) => sum + c.total, 0)),
    categories,
  });
}

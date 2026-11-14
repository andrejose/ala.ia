// Relatórios: funções report_* do banco (08_reports.sql), com o RLS do usuário.

const round = (value) => Math.round(Number(value) * 100) / 100;

// Linha de report_monthly_summary ou report_monthly_series -> receitas, despesas e resultado
function summaryTotals(row) {
  const income = { paid: round(row.income_paid), pending: round(row.income_pending) };
  const expense = { paid: round(row.expense_paid), pending: round(row.expense_pending) };
  income.total = round(income.paid + income.pending);
  expense.total = round(expense.paid + expense.pending);

  return {
    income,
    expense,
    balance: {
      paid: round(income.paid - expense.paid),
      total: round(income.total - expense.total),
    },
  };
}

// Mês pedido ("YYYY-MM") e as datas do período, para devolver na resposta
function periodOf({ month, from, to }) {
  return { ...(month && { month: month.slice(0, 7) }), from, to };
}

// GET /households/:householdId/reports/summary?month=YYYY-MM
// GET /households/:householdId/reports/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function summary(req, res) {
  const { from, to } = req.validated.query;

  const { data, error } = await req.supabase
    .rpc("report_period_summary", { p_household_id: req.household.id, p_from: from, p_to: to })
    .single();
  if (error) throw error;

  res.status(200).json({ ...periodOf(req.validated.query), ...summaryTotals(data) });
}

// GET /households/:householdId/reports/monthly?from=YYYY-MM&to=YYYY-MM
// GET /households/:householdId/reports/monthly?from=YYYY-MM-DD&to=YYYY-MM-DD (meses do período, cortados nas datas)
export async function monthly(req, res) {
  const { period, from, to } = req.validated.query;

  const { data, error } = await req.supabase.rpc(period ? "report_period_series" : "report_monthly_series", {
    p_household_id: req.household.id,
    p_from: from,
    p_to: to,
  });
  if (error) throw error;

  res.status(200).json({
    from: period ? from : from.slice(0, 7),
    to: period ? to : to.slice(0, 7),
    months: data.map((row) => ({ month: row.month.slice(0, 7), ...summaryTotals(row) })),
  });
}

// GET /households/:householdId/reports/by-category?month=YYYY-MM&type=expense
// GET /households/:householdId/reports/by-category?from=YYYY-MM-DD&to=YYYY-MM-DD&type=expense
export async function byCategory(req, res) {
  const { from, to, type } = req.validated.query;

  const { data, error } = await req.supabase.rpc("report_period_by_category", {
    p_household_id: req.household.id,
    p_from: from,
    p_to: to,
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
    ...periodOf(req.validated.query),
    type,
    total: round(categories.reduce((sum, c) => sum + c.total, 0)),
    categories,
  });
}

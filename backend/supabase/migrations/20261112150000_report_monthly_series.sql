-- Relatório mês a mês: resumo de cada mês de um intervalo (para a tela de
-- relatórios). Só acrescenta uma função; nada da v1.0 muda.

create or replace function public.report_monthly_series(
  p_household_id uuid,
  p_from         date,
  p_to           date
)
returns table (
  month           date,
  income_paid     numeric,
  income_pending  numeric,
  expense_paid    numeric,
  expense_pending numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    m.month::date,
    coalesce(sum(t.amount) filter (where t.type = 'income'  and t.payment_date is not null), 0),
    coalesce(sum(t.amount) filter (where t.type = 'income'  and t.payment_date is null),     0),
    coalesce(sum(t.amount) filter (where t.type = 'expense' and t.payment_date is not null), 0),
    coalesce(sum(t.amount) filter (where t.type = 'expense' and t.payment_date is null),     0)
  from generate_series(
         date_trunc('month', p_from::timestamp),
         date_trunc('month', p_to::timestamp),
         interval '1 month'
       ) as m(month)
  left join public.transactions t
    on t.household_id = p_household_id
   and t.due_date >= m.month::date
   and t.due_date <  (m.month + interval '1 month')::date
  group by m.month
  order by m.month;
$$;

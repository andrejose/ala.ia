-- =============================================================================
-- 08_reports.sql
-- Relatórios do controle de gastos, chamados via supabase.rpc.
--
-- SECURITY INVOKER: as funções rodam com as permissões de quem chama, então o
-- RLS de transactions/categories continua valendo (só vê o próprio household).
--
-- O mês considerado é o da DATA DE VENCIMENTO (due_date), ou seja, o mês de
-- competência do lançamento. Transferências não entram: só movem dinheiro
-- entre contas do mesmo household.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Resumo do mês: receitas e despesas, separando pagas e pendentes.
-- Uso: supabase.rpc('report_monthly_summary', { p_household_id, p_month: '2026-11-01' })
-- -----------------------------------------------------------------------------
create or replace function public.report_monthly_summary(
  p_household_id uuid,
  p_month        date
)
returns table (
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
    coalesce(sum(amount) filter (where type = 'income'  and payment_date is not null), 0),
    coalesce(sum(amount) filter (where type = 'income'  and payment_date is null),     0),
    coalesce(sum(amount) filter (where type = 'expense' and payment_date is not null), 0),
    coalesce(sum(amount) filter (where type = 'expense' and payment_date is null),     0)
  from public.transactions
  where household_id = p_household_id
    and due_date >= date_trunc('month', p_month)::date
    and due_date <  (date_trunc('month', p_month) + interval '1 month')::date;
$$;

-- -----------------------------------------------------------------------------
-- Total por categoria no mês, do maior para o menor.
-- Uso: supabase.rpc('report_by_category', { p_household_id, p_month, p_type: 'expense' })
-- -----------------------------------------------------------------------------
create or replace function public.report_by_category(
  p_household_id uuid,
  p_month        date,
  p_type         public.transaction_type default 'expense'
)
returns table (
  category_id       uuid,
  name              varchar,
  color             varchar,
  icon              varchar,
  total             numeric,
  paid              numeric,
  pending           numeric,
  transaction_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.id,
    c.name,
    c.color,
    c.icon,
    sum(t.amount),
    coalesce(sum(t.amount) filter (where t.payment_date is not null), 0),
    coalesce(sum(t.amount) filter (where t.payment_date is null),     0),
    count(*)
  from public.transactions t
  join public.categories c on c.id = t.category_id
  where t.household_id = p_household_id
    and t.type = p_type
    and t.due_date >= date_trunc('month', p_month)::date
    and t.due_date <  (date_trunc('month', p_month) + interval '1 month')::date
  group by c.id, c.name, c.color, c.icon
  order by sum(t.amount) desc, c.name;
$$;

-- -----------------------------------------------------------------------------
-- Mês a mês: o resumo de cada mês do intervalo, inclusive os meses sem
-- lançamentos (vêm zerados), do mais antigo para o mais recente.
-- Uso: supabase.rpc('report_monthly_series', { p_household_id, p_from: '2026-06-01', p_to: '2026-11-01' })
-- -----------------------------------------------------------------------------
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

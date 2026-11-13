-- Orçamento por categoria.
-- Só acrescenta uma tabela nova (budgets) e uma função de relatório
-- (report_budgets). Nada do que já existe muda.

create table public.budgets (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  category_id   uuid not null,
  -- Fixo em 'expense': entra na FK composta e garante categoria de despesa
  category_type public.transaction_type not null default 'expense',
  amount        numeric(12, 2) not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint budgets_category_fkey
    foreign key (category_id, household_id, category_type)
    references public.categories (id, household_id, type)
    on delete cascade,
  constraint budgets_category_key unique (household_id, category_id),
  constraint budgets_amount_chk check (amount > 0),
  constraint budgets_category_type_chk check (category_type = 'expense')
);

create index budgets_category_id_idx on public.budgets (category_id);

create trigger budgets_set_updated_at
  before update on public.budgets
  for each row execute function public.set_updated_at();

alter table public.budgets enable row level security;

create policy "Membros gerenciam o orçamento do household"
  on public.budgets for all
  to authenticated
  using ((select public.is_household_member(household_id)))
  with check ((select public.is_household_member(household_id)));

-- -----------------------------------------------------------------------------
-- Limite e gasto de cada categoria com orçamento, no mês (do mais usado em %
-- para o menos usado).
--   supabase.rpc('report_budgets', { p_household_id, p_month: '2026-11-01' })
-- -----------------------------------------------------------------------------
create or replace function public.report_budgets(p_household_id uuid, p_month date)
returns table (
  category_id uuid,
  name        varchar,
  color       varchar,
  icon        varchar,
  is_active   boolean,
  amount      numeric,
  spent       numeric,
  paid        numeric,
  pending     numeric
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
    c.is_active,
    b.amount,
    coalesce(sum(t.amount), 0),
    coalesce(sum(t.amount) filter (where t.payment_date is not null), 0),
    coalesce(sum(t.amount) filter (where t.payment_date is null), 0)
  from public.budgets b
  join public.categories c on c.id = b.category_id
  left join public.transactions t
    on t.category_id = b.category_id
   and t.household_id = b.household_id
   and t.type = 'expense'
   and t.due_date >= date_trunc('month', p_month)::date
   and t.due_date <  (date_trunc('month', p_month) + interval '1 month')::date
  where b.household_id = p_household_id
  group by c.id, c.name, c.color, c.icon, c.is_active, b.amount
  order by coalesce(sum(t.amount), 0) / b.amount desc, c.name;
$$;

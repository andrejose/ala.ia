-- =============================================================================
-- 10_recurrences.sql
-- Lançamentos recorrentes: aluguel, salário, assinaturas, parcelas.
--
-- Uma recorrência é a regra ("R$ 1.800,00 de aluguel todo dia 10"). Os
-- lançamentos de cada mês são criados por materialize_recurrences(), que pode
-- ser chamada quantas vezes for preciso: cada mês de cada regra é gerado uma
-- vez só (generated_until e o índice único (recurrence_id, recurrence_month)).
--
--   * auto_paid = false -> o lançamento entra pendente (a pagar ou a receber)
--                          e é gerado até o fim do mês seguinte
--   * auto_paid = true  -> débito automático: entra pago, mas só quando o dia
--                          chega (para não mexer no saldo antes da hora)
--   * occurrences       -> número de vezes (parcelas); nulo = sem fim
--   * day_of_month 31 em mês com 30 dias -> último dia do mês
-- =============================================================================

create table public.recurrences (
  id                     uuid primary key default gen_random_uuid(),
  household_id           uuid not null references public.households (id) on delete cascade,
  account_id             uuid not null,
  destination_account_id uuid,
  category_id            uuid,
  type                   public.transaction_type not null,
  description            varchar(200) not null,
  amount                 numeric(12, 2) not null,
  day_of_month           smallint not null,
  start_month            date not null,       -- 1º dia do primeiro mês
  occurrences            integer,             -- nulo = sem fim
  auto_paid              boolean not null default false,
  is_active              boolean not null default true,  -- pausar sem perder o histórico
  -- Último mês já gerado. A geração só cria meses depois dele: assim, excluir
  -- o lançamento de um mês (pular o aluguel de janeiro) não o faz voltar.
  generated_until        date,
  user_id                uuid default auth.uid()
                         references public.profiles (id) on delete set null,  -- quem criou
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint recurrences_id_household_id_key unique (id, household_id),
  -- As mesmas FKs compostas dos lançamentos: contas e categoria do mesmo
  -- household, e categoria do mesmo tipo
  constraint recurrences_account_fkey
    foreign key (account_id, household_id)
    references public.accounts (id, household_id),
  constraint recurrences_destination_account_fkey
    foreign key (destination_account_id, household_id)
    references public.accounts (id, household_id),
  constraint recurrences_category_fkey
    foreign key (category_id, household_id, type)
    references public.categories (id, household_id, type),

  constraint recurrences_amount_chk check (amount > 0),
  constraint recurrences_day_chk check (day_of_month between 1 and 31),
  constraint recurrences_start_month_chk check (start_month = date_trunc('month', start_month)::date),
  constraint recurrences_occurrences_chk check (occurrences is null or occurrences between 1 and 600),
  constraint recurrences_type_chk check (
    (
      type = 'transfer'
      and destination_account_id is not null
      and destination_account_id <> account_id
      and category_id is null
    )
    or (
      type <> 'transfer'
      and destination_account_id is null
      and category_id is not null
    )
  )
);

create index recurrences_household_id_idx on public.recurrences (household_id);
create index recurrences_account_id_idx on public.recurrences (account_id);
create index recurrences_destination_account_id_idx on public.recurrences (destination_account_id);
create index recurrences_category_id_idx on public.recurrences (category_id);
create index recurrences_user_id_idx on public.recurrences (user_id);

create trigger recurrences_set_updated_at
  before update on public.recurrences
  for each row execute function public.set_updated_at();

alter table public.recurrences enable row level security;

create policy "Membros gerenciam as recorrências do household"
  on public.recurrences for all
  to authenticated
  using ((select public.is_household_member(household_id)))
  with check ((select public.is_household_member(household_id)));

-- -----------------------------------------------------------------------------
-- Lançamento gerado por uma recorrência: de qual regra e de qual mês.
-- Excluir a regra mantém os lançamentos já gerados (só desfaz o vínculo).
-- -----------------------------------------------------------------------------
alter table public.transactions
  add column recurrence_id    uuid,
  add column recurrence_month date,
  add constraint transactions_recurrence_fkey
    foreign key (recurrence_id, household_id)
    references public.recurrences (id, household_id)
    on delete set null (recurrence_id);

create unique index transactions_recurrence_month_key
  on public.transactions (recurrence_id, recurrence_month);

-- -----------------------------------------------------------------------------
-- Gera os lançamentos que faltam das recorrências ativas do household, até o
-- fim do mês seguinte (débito automático: só até hoje), e devolve quantos criou.
--   supabase.rpc('materialize_recurrences', { p_household_id })
-- -----------------------------------------------------------------------------
create or replace function public.materialize_recurrences(p_household_id uuid)
returns integer
language sql
volatile
security invoker
set search_path = ''
as $$
  with months as (
    select
      r.id,
      r.household_id, r.account_id, r.destination_account_id, r.category_id, r.type,
      r.description, r.amount, r.occurrences, r.auto_paid,
      m.month::date as month,
      -- número da parcela, contado desde o primeiro mês da regra
      (
        (extract(year from m.month) - extract(year from r.start_month)) * 12
        + extract(month from m.month) - extract(month from r.start_month)
      )::int + 1 as n,
      make_date(
        extract(year from m.month)::int,
        extract(month from m.month)::int,
        least(r.day_of_month::int, extract(day from (m.month + interval '1 month - 1 day'))::int)
      ) as due_date
    from public.recurrences r
    cross join lateral generate_series(
      greatest(r.start_month, (r.generated_until + interval '1 month')::date)::timestamp,
      least(
        (date_trunc('month', current_date) + interval '1 month')::timestamp,
        case when r.occurrences is null then 'infinity'::timestamp
             else (r.start_month + make_interval(months => r.occurrences - 1))::timestamp end
      ),
      interval '1 month'
    ) as m(month)
    where r.household_id = p_household_id
      and r.is_active
  ),
  -- Débito automático só entra quando o dia chega
  due as (
    select * from months where not auto_paid or due_date <= current_date
  ),
  inserted as (
    insert into public.transactions (
      household_id, account_id, destination_account_id, category_id, type,
      description, amount, due_date, payment_date, recurrence_id, recurrence_month
    )
    select
      household_id, account_id, destination_account_id, category_id, type,
      case when occurrences is null then description
           else left(description, 190) || ' (' || n || '/' || occurrences || ')' end,
      amount,
      due_date,
      case when auto_paid then due_date end,
      id,
      month
    from due
    on conflict (recurrence_id, recurrence_month) do nothing
    returning 1
  ),
  advanced as (
    update public.recurrences r
       set generated_until = d.last_month
      from (select id, max(month) as last_month from due group by id) d
     where r.id = d.id
    returning 1
  )
  select (select count(*)::int from inserted) + 0 * (select count(*)::int from advanced);
$$;

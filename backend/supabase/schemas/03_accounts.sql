-- =============================================================================
-- 03_accounts.sql
-- Contas do household (corrente, poupança, investimento, dinheiro).
--
-- O saldo NÃO é armazenado: é calculado a partir de initial_balance + transações
-- (ver view public.account_balances em 06_balances.sql). Isso evita saldo
-- inconsistente quando uma transação é editada ou excluída.
-- =============================================================================

create table public.accounts (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households (id) on delete cascade,
  name            varchar(100) not null,
  type            public.account_type not null default 'checking',
  initial_balance numeric(12, 2) not null default 0,
  is_active       boolean not null default true,  -- arquivar em vez de excluir
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Permite FK composta (account_id, household_id) em transactions, garantindo
  -- que uma transação só use contas do próprio household.
  constraint accounts_id_household_id_key unique (id, household_id)
);

create index accounts_household_id_idx on public.accounts (household_id);

create trigger accounts_set_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS: qualquer membro do household tem acesso total às contas do household
-- -----------------------------------------------------------------------------
alter table public.accounts enable row level security;

create policy "Membros gerenciam as contas do household"
  on public.accounts for all
  to authenticated
  using ((select public.is_household_member(household_id)))
  with check ((select public.is_household_member(household_id)));


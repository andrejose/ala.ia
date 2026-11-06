-- =============================================================================
-- 05_transactions.sql
-- Lançamentos financeiros: receita, despesa ou transferência entre contas.
--
-- Regras:
--   * income/expense -> exige categoria do MESMO tipo; sem conta de destino
--   * transfer       -> exige conta de destino (diferente da origem);
--                       sem categoria
--   * amount é sempre positivo; o "type" define se entra ou sai
--   * payment_date nula = lançamento pendente (previsto)
--   * contas e categoria precisam ser do mesmo household (FKs compostas)
-- =============================================================================

create table public.transactions (
  id                     uuid primary key default gen_random_uuid(),
  household_id           uuid not null references public.households (id) on delete cascade,
  account_id             uuid not null,
  destination_account_id uuid,
  category_id            uuid,
  user_id                uuid default auth.uid()
                         references public.profiles (id) on delete set null,  -- quem lançou
  type                   public.transaction_type not null,
  description            varchar(200) not null,
  amount                 numeric(12, 2) not null,
  due_date               date not null default current_date,
  payment_date           date,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint transactions_account_fkey
    foreign key (account_id, household_id)
    references public.accounts (id, household_id),
  constraint transactions_destination_account_fkey
    foreign key (destination_account_id, household_id)
    references public.accounts (id, household_id),
  -- Inclui "type": uma receita só aceita categoria de receita (e vice-versa).
  -- Em transferências category_id é nulo e a FK não é verificada.
  constraint transactions_category_fkey
    foreign key (category_id, household_id, type)
    references public.categories (id, household_id, type),

  constraint transactions_amount_chk check (amount > 0),
  constraint transactions_type_chk check (
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

create index transactions_household_due_date_idx    on public.transactions (household_id, due_date);
create index transactions_account_id_idx            on public.transactions (account_id);
create index transactions_destination_account_id_idx on public.transactions (destination_account_id);
create index transactions_category_id_idx           on public.transactions (category_id);
create index transactions_user_id_idx               on public.transactions (user_id);

create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Autor do lançamento (user_id): sempre quem está logado.
--   * INSERT: ignora o user_id enviado e grava auth.uid(). Sem usuário logado
--     (ex.: service role em scripts), mantém o valor informado.
--   * UPDATE: o autor não pode ser trocado por outro usuário. Virar null é
--     permitido, porque é o que a FK faz quando o perfil do autor é excluído
--     (on delete set null).
-- A API já faz isso; o trigger garante o mesmo para quem usar o Supabase direto.
-- -----------------------------------------------------------------------------
create or replace function public.set_transaction_author()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if (select auth.uid()) is not null then
      new.user_id := (select auth.uid());
    end if;
  elsif new.user_id is not null and new.user_id is distinct from old.user_id then
    new.user_id := old.user_id;
  end if;
  return new;
end;
$$;

create trigger transactions_set_author
  before insert or update on public.transactions
  for each row execute function public.set_transaction_author();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.transactions enable row level security;

create policy "Membros gerenciam as transações do household"
  on public.transactions for all
  to authenticated
  using ((select public.is_household_member(household_id)))
  with check ((select public.is_household_member(household_id)));


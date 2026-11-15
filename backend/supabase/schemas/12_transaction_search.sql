-- =============================================================================
-- 12_transaction_search.sql
-- Busca de lançamentos para a tabela (filtros por coluna), os totais do que foi
-- filtrado e a troca de categoria em lote.
--
-- SECURITY INVOKER: rodam com as permissões de quem chama, então o RLS de
-- transactions/accounts/categories continua valendo.
-- =============================================================================

-- Busca sem diferenciar acentos: "acougue" acha "AÇOUGUE"
create extension if not exists unaccent with schema extensions;

-- -----------------------------------------------------------------------------
-- Lançamentos do household que passam nos filtros (todos opcionais), com os
-- nomes da conta, da conta de destino e da categoria, para ordenar por eles.
-- A ordem e a paginação ficam com quem chama (PostgREST: .order e .range).
--   * p_query: trecho da descrição, sem diferenciar maiúsculas nem acentos
--   * p_category_ids / p_uncategorized: categorias escolhidas e/ou "sem
--     categoria" (transferências); sem nenhum dos dois, todas
--   * p_account_ids: lançamentos em que a conta é origem ou destino
--   * p_status: 'paid' (com payment_date) ou 'pending' (sem)
--   * p_min_amount / p_max_amount: valor (sempre positivo)
-- -----------------------------------------------------------------------------
create or replace function public.search_transactions(
  p_household_id  uuid,
  p_from          date default null,
  p_to            date default null,
  p_query         text default null,
  p_types         public.transaction_type[] default null,
  p_category_ids  uuid[] default null,
  p_uncategorized boolean default false,
  p_account_ids   uuid[] default null,
  p_status        text default null,
  p_min_amount    numeric default null,
  p_max_amount    numeric default null
)
returns table (
  id                       uuid,
  type                     public.transaction_type,
  description              varchar,
  amount                   numeric,
  account_id               uuid,
  destination_account_id   uuid,
  category_id              uuid,
  due_date                 date,
  payment_date             date,
  recurrence_id            uuid,
  imported                 boolean,
  account_name             varchar,
  destination_account_name varchar,
  category_name            varchar,
  status                   text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    t.id, t.type, t.description, t.amount, t.account_id, t.destination_account_id, t.category_id,
    t.due_date, t.payment_date, t.recurrence_id, t.import_hash is not null,
    a.name, d.name, c.name,
    case when t.payment_date is null then 'pending' else 'paid' end
  from public.transactions t
  join public.accounts a on a.id = t.account_id
  left join public.accounts d on d.id = t.destination_account_id
  left join public.categories c on c.id = t.category_id
  where t.household_id = p_household_id
    and (p_from is null or t.due_date >= p_from)
    and (p_to is null or t.due_date <= p_to)
    and (
      p_query is null
      or strpos(
           extensions.unaccent('extensions.unaccent'::regdictionary, lower(t.description)),
           extensions.unaccent('extensions.unaccent'::regdictionary, lower(p_query))
         ) > 0
    )
    and (p_types is null or t.type = any (p_types))
    and (
      (p_category_ids is null and not p_uncategorized)
      or t.category_id = any (coalesce(p_category_ids, '{}'))
      or (p_uncategorized and t.category_id is null)
    )
    and (p_account_ids is null or t.account_id = any (p_account_ids) or t.destination_account_id = any (p_account_ids))
    and (p_status is null or (p_status = 'paid') = (t.payment_date is not null))
    and (p_min_amount is null or t.amount >= p_min_amount)
    and (p_max_amount is null or t.amount <= p_max_amount);
$$;

-- -----------------------------------------------------------------------------
-- Totais do que a busca encontrou: quantos lançamentos e quanto entrou, saiu e
-- foi transferido. Mesmos filtros de search_transactions.
-- -----------------------------------------------------------------------------
create or replace function public.search_transactions_totals(
  p_household_id  uuid,
  p_from          date default null,
  p_to            date default null,
  p_query         text default null,
  p_types         public.transaction_type[] default null,
  p_category_ids  uuid[] default null,
  p_uncategorized boolean default false,
  p_account_ids   uuid[] default null,
  p_status        text default null,
  p_min_amount    numeric default null,
  p_max_amount    numeric default null
)
returns table (
  count    bigint,
  income   numeric,
  expense  numeric,
  transfer numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    count(*),
    coalesce(sum(s.amount) filter (where s.type = 'income'), 0),
    coalesce(sum(s.amount) filter (where s.type = 'expense'), 0),
    coalesce(sum(s.amount) filter (where s.type = 'transfer'), 0)
  from public.search_transactions(
    p_household_id, p_from, p_to, p_query, p_types, p_category_ids,
    p_uncategorized, p_account_ids, p_status, p_min_amount, p_max_amount
  ) s;
$$;

-- -----------------------------------------------------------------------------
-- Troca a categoria de vários lançamentos de uma vez. Só muda os do mesmo tipo
-- da categoria (despesa com categoria de despesa, receita com de receita);
-- transferências e os de outro tipo ficam como estão e entram em "skipped".
-- -----------------------------------------------------------------------------
create or replace function public.recategorize_transactions(
  p_household_id uuid,
  p_ids          uuid[],
  p_category_id  uuid
)
returns table (
  updated integer,
  skipped integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_type    public.transaction_type;
  v_updated integer;
begin
  select c.type into v_type
    from public.categories c
   where c.id = p_category_id
     and c.household_id = p_household_id;
  if v_type is null then
    raise exception 'Categoria não encontrada.' using errcode = 'P0002';
  end if;

  update public.transactions t
     set category_id = p_category_id
   where t.household_id = p_household_id
     and t.id = any (p_ids)
     and t.type = v_type;
  get diagnostics v_updated = row_count;

  return query select v_updated, cardinality(array(select distinct unnest(p_ids))) - v_updated;
end;
$$;

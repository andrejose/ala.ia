-- =============================================================================
-- Tabela de lançamentos: search_transactions (filtros), search_transactions_totals
-- e recategorize_transactions (troca de categoria em lote).
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'ana@teste.local', '{"name": "Ana"}'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bruno@teste.local', '{"name": "Bruno"}');

create temporary table t on commit drop as
select
  hm.household_id as hid,
  gen_random_uuid() as corrente,
  gen_random_uuid() as poupanca,
  (select c.id from public.categories c where c.household_id = hm.household_id and c.name = 'Mercado') as mercado,
  (select c.id from public.categories c where c.household_id = hm.household_id and c.name = 'Transporte') as transporte,
  (select c.id from public.categories c where c.household_id = hm.household_id and c.name = 'Lazer') as lazer,
  (select c.id from public.categories c where c.household_id = hm.household_id and c.name = 'Salário') as salario,
  (select c.id from public.categories c
     join public.household_members b on b.household_id = c.household_id
    where b.user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and c.name = 'Mercado') as mercado_do_bruno
from public.household_members hm
where hm.user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
grant select on t to authenticated;

insert into public.accounts (id, household_id, name)
select corrente, hid, 'Corrente' from t
union all select poupanca, hid, 'Poupança' from t;

insert into public.transactions (household_id, account_id, destination_account_id, category_id, type, description, amount, due_date, payment_date)
select hid, corrente, null::uuid, lazer, 'expense'::public.transaction_type, 'AÇOUGUE SERRA ALTA', 69.67, '2026-10-20'::date, '2026-10-20'::date from t
union all select hid, corrente, null, lazer, 'expense', 'Posto Z22', 237.25, '2026-10-14', '2026-10-14' from t
union all select hid, corrente, null, lazer, 'expense', 'POSTO LINHA VERDE', 228.49, '2026-10-31', null from t
union all select hid, corrente, null, mercado, 'expense', 'Feira', 120, '2026-09-05', '2026-09-05' from t
union all select hid, corrente, null, salario, 'income', 'Salário', 5000, '2026-10-05', '2026-10-05' from t
union all select hid, corrente, poupanca, null, 'transfer', 'Guardar', 500, '2026-10-06', '2026-10-06' from t;

select results_eq(
  $$ select description::text from public.search_transactions((select hid from t), p_query => 'acougue') $$,
  $$ values ('AÇOUGUE SERRA ALTA'::text) $$,
  'busca na descrição sem diferenciar maiúsculas nem acentos'
);

select results_eq(
  $$ select description::text from public.search_transactions((select hid from t), p_query => 'posto') order by due_date $$,
  $$ values ('Posto Z22'::text), ('POSTO LINHA VERDE') $$,
  'busca acha o trecho em qualquer lugar da descrição'
);

select results_eq(
  $$ select count(*)::int from public.search_transactions((select hid from t), p_from => '2026-10-01', p_to => '2026-10-31') $$,
  $$ values (5) $$,
  'filtra pelo vencimento, com as duas datas incluídas'
);

select results_eq(
  $$ select description::text from public.search_transactions((select hid from t),
       p_category_ids => array[(select mercado from t)], p_uncategorized => true) order by description $$,
  $$ values ('Feira'::text), ('Guardar') $$,
  'categorias escolhidas mais "sem categoria" (a transferência)'
);

select results_eq(
  $$ select description::text from public.search_transactions((select hid from t), p_account_ids => array[(select poupanca from t)]) $$,
  $$ values ('Guardar'::text) $$,
  'filtro de conta pega também quando ela é o destino da transferência'
);

select results_eq(
  $$ select description::text from public.search_transactions((select hid from t),
       p_types => array['expense']::public.transaction_type[], p_status => 'pending') $$,
  $$ values ('POSTO LINHA VERDE'::text) $$,
  'filtra por tipo e situação'
);

select results_eq(
  $$ select description::text from public.search_transactions((select hid from t), p_min_amount => 200, p_max_amount => 500) order by amount $$,
  $$ values ('POSTO LINHA VERDE'::text), ('Posto Z22'), ('Guardar') $$,
  'filtra pelo valor mínimo e máximo'
);

select results_eq(
  $$ select account_name::text, destination_account_name::text, category_name::text, status
       from public.search_transactions((select hid from t), p_query => 'guardar') $$,
  $$ values ('Corrente'::text, 'Poupança'::text, null::text, 'paid'::text) $$,
  'traz os nomes da conta, do destino e da categoria, e a situação'
);

select results_eq(
  $$ select count, income, expense, transfer
       from public.search_transactions_totals((select hid from t), p_from => '2026-10-01', p_to => '2026-10-31') $$,
  $$ values (5::bigint, 5000.00, 535.41, 500.00) $$,
  'totais do que foi filtrado'
);

-- Troca em lote: os dois postos (despesas) e o salário e a transferência (outros tipos)
select results_eq(
  $$ select updated, skipped from public.recategorize_transactions(
       (select hid from t),
       array(select x.id from public.transactions x, t where x.household_id = t.hid and x.description in ('Posto Z22', 'POSTO LINHA VERDE', 'Salário', 'Guardar')),
       (select transporte from t)) $$,
  $$ values (2, 2) $$,
  'troca só os do mesmo tipo da categoria; os outros ficam como estão'
);

select throws_ok(
  $$ select * from public.recategorize_transactions((select hid from t), array[gen_random_uuid()], (select mercado_do_bruno from t)) $$,
  'P0002', 'Categoria não encontrada.',
  'não aceita categoria de outro household'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "bbbbbbbb-0000-0000-0000-000000000002", "role": "authenticated"}';

select is(
  (select count::int from public.search_transactions_totals((select hid from t))),
  0,
  'quem é de fora não vê os lançamentos do household alheio'
);

reset role;

select * from finish();
rollback;

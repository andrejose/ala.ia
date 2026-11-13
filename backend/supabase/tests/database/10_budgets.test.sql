-- =============================================================================
-- Orçamento por categoria: só categoria de despesa, um limite por categoria, e
-- report_budgets() com a mesma conta do relatório por categoria.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(6);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'ana@teste.local', '{"name": "Ana"}'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bruno@teste.local', '{"name": "Bruno"}');

create temporary table t on commit drop as
select
  hm.household_id as hid,
  gen_random_uuid() as corrente,
  (select c.id from public.categories c where c.household_id = hm.household_id and c.name = 'Mercado') as mercado,
  (select c.id from public.categories c where c.household_id = hm.household_id and c.name = 'Transporte') as transporte,
  (select c.id from public.categories c where c.household_id = hm.household_id and c.name = 'Lazer') as lazer,
  (select c.id from public.categories c where c.household_id = hm.household_id and c.name = 'Salário') as salario
from public.household_members hm
where hm.user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
grant select on t to authenticated;

insert into public.accounts (id, household_id, name) select corrente, hid, 'Corrente' from t;

select throws_ok(
  $$ insert into public.budgets (household_id, category_id, amount) select hid, salario, 100 from t $$,
  '23503', null,
  'orçamento só para categoria de despesa'
);

insert into public.budgets (household_id, category_id, amount)
select hid, mercado, 800 from t
union all select hid, transporte, 200 from t
union all select hid, lazer, 300 from t;

select throws_ok(
  $$ insert into public.budgets (household_id, category_id, amount) select hid, mercado, 500 from t $$,
  '23505', null,
  'um limite por categoria'
);

insert into public.transactions (household_id, account_id, category_id, type, description, amount, due_date, payment_date)
select hid, corrente, mercado, 'expense'::public.transaction_type, 'Feira', 400, '2026-11-05'::date, '2026-11-05'::date from t
union all select hid, corrente, mercado, 'expense', 'Mercado a pagar', 200, '2026-11-20', null from t
union all select hid, corrente, mercado, 'expense', 'Mês passado', 999, '2026-10-30', '2026-10-30' from t
union all select hid, corrente, transporte, 'expense', 'Uber', 250, '2026-11-08', '2026-11-08' from t;

select results_eq(
  $$ select name::text, amount, spent, paid, pending from public.report_budgets((select hid from t), '2026-11-01') $$,
  $$ values ('Transporte'::text, 200.00, 250.00, 250.00, 0.00),
            ('Mercado', 800.00, 600.00, 400.00, 200.00),
            ('Lazer', 300.00, 0.00, 0.00, 0.00) $$,
  'gasto do mês com pendentes, do mais usado (em %) ao menos, e categoria sem gasto zerada'
);

select is(
  (select spent from public.report_budgets((select hid from t), '2026-10-01') where name = 'Mercado'),
  999.00,
  'cada mês conta só os lançamentos daquele mês'
);

-- Excluir a categoria leva o limite junto (não há lançamentos em Lazer)
delete from public.categories where id = (select lazer from t);
select is(
  (select count(*)::int from public.budgets b, t where b.household_id = t.hid),
  2,
  'excluir a categoria exclui o limite dela'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "bbbbbbbb-0000-0000-0000-000000000002", "role": "authenticated"}';

select is(
  (select count(*)::int from public.report_budgets((select hid from t), '2026-11-01'))
    + (select count(*)::int from public.budgets),
  0,
  'quem é de fora não vê o orçamento de outro household'
);

reset role;

select * from finish();
rollback;

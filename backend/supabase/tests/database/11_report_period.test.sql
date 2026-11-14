-- =============================================================================
-- Relatórios por período: datas inclusive, mesmas regras dos relatórios do mês,
-- e o mês a mês com o primeiro e o último mês cortados nas datas do período.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

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
  (select c.id from public.categories c where c.household_id = hm.household_id and c.name = 'Lazer') as lazer,
  (select c.id from public.categories c where c.household_id = hm.household_id and c.name = 'Salário') as salario
from public.household_members hm
where hm.user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
grant select on t to authenticated;

insert into public.accounts (id, household_id, name)
select corrente, hid, 'Corrente' from t
union all select poupanca, hid, 'Poupança' from t;

insert into public.transactions (household_id, account_id, destination_account_id, category_id, type, description, amount, due_date, payment_date)
select hid, corrente, null::uuid, mercado, 'expense'::public.transaction_type, 'Antes do período', 999, '2026-09-09'::date, '2026-09-09'::date from t
union all select hid, corrente, null, mercado, 'expense', 'Primeiro dia', 100, '2026-09-10', '2026-09-10' from t
union all select hid, corrente, null, lazer, 'expense', 'Meio, a pagar', 50, '2026-10-20', null from t
union all select hid, corrente, null, salario, 'income', 'Salário', 3000, '2026-10-05', '2026-10-05' from t
union all select hid, corrente, poupanca, null, 'transfer', 'Guardar', 500, '2026-10-06', '2026-10-06' from t
union all select hid, corrente, null, mercado, 'expense', 'Último dia', 200, '2026-11-15', '2026-11-15' from t
union all select hid, corrente, null, mercado, 'expense', 'Depois do período', 888, '2026-11-16', '2026-11-16' from t;

select results_eq(
  $$ select income_paid, income_pending, expense_paid, expense_pending
       from public.report_period_summary((select hid from t), '2026-09-10', '2026-11-15') $$,
  $$ values (3000.00, 0.00, 300.00, 50.00) $$,
  'o período inclui o primeiro e o último dia, conta pendentes e deixa transferências fora'
);

select results_eq(
  $$ select * from public.report_period_summary((select hid from t), '2026-10-01', '2026-10-31') $$,
  $$ select * from public.report_monthly_summary((select hid from t), '2026-10-01') $$,
  'um mês inteiro dá o mesmo que o resumo do mês'
);

select results_eq(
  $$ select name::text, total, paid, pending, transaction_count
       from public.report_period_by_category((select hid from t), '2026-09-10', '2026-11-15', 'expense') $$,
  $$ values ('Mercado'::text, 300.00, 300.00, 0.00, 2::bigint),
            ('Lazer', 50.00, 0.00, 50.00, 1::bigint) $$,
  'por categoria no período, do maior para o menor'
);

select results_eq(
  $$ select name::text, total from public.report_period_by_category((select hid from t), '2026-09-10', '2026-11-15', 'income') $$,
  $$ values ('Salário'::text, 3000.00) $$,
  'receitas por categoria no período'
);

select results_eq(
  $$ select month, income_paid, expense_paid, expense_pending
       from public.report_period_series((select hid from t), '2026-09-10', '2026-11-15') $$,
  $$ values ('2026-09-01'::date, 0.00, 100.00, 0.00),
            ('2026-10-01'::date, 3000.00, 0.00, 50.00),
            ('2026-11-01'::date, 0.00, 200.00, 0.00) $$,
  'mês a mês com setembro a partir do dia 10 e novembro até o dia 15'
);

select is(
  (select count(*)::int from public.report_period_series((select hid from t), '2026-11-20', '2026-11-10')),
  0,
  'período invertido não devolve meses'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "bbbbbbbb-0000-0000-0000-000000000002", "role": "authenticated"}';

select results_eq(
  $$ select income_paid + expense_paid + expense_pending
       from public.report_period_summary((select hid from t), '2026-01-01', '2026-12-31') $$,
  $$ values (0.00) $$,
  'quem é de fora não vê os lançamentos do household alheio'
);

reset role;

select * from finish();
rollback;

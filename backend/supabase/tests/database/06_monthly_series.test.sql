-- =============================================================================
-- Relatório mês a mês (report_monthly_series): um resumo por mês do intervalo,
-- com os meses vazios zerados, sem transferências e só do espaço de quem chama.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(5);

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
  (select c.id from public.categories c where c.household_id = hm.household_id and c.name = 'Salário') as salario
from public.household_members hm
where hm.user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
grant select on t to authenticated;

insert into public.accounts (id, household_id, name)
select corrente, hid, 'Corrente' from t
union all select poupanca, hid, 'Poupança' from t;

insert into public.transactions (household_id, account_id, destination_account_id, category_id, type, description, amount, due_date, payment_date)
select hid, corrente, null::uuid, salario, 'income'::public.transaction_type, 'Salário', 3000, '2026-09-05'::date, '2026-09-05'::date from t
union all select hid, corrente, null, mercado, 'expense', 'Mercado', 500, '2026-09-30', '2026-09-30' from t
union all select hid, corrente, null, salario, 'income', 'Salário', 3000, '2026-11-05', '2026-11-05' from t
union all select hid, corrente, null, mercado, 'expense', 'Mercado', 700, '2026-11-01', '2026-11-01' from t
union all select hid, corrente, null, mercado, 'expense', 'Mercado a pagar', 200, '2026-11-30', null from t
union all select hid, corrente, poupanca, null, 'transfer', 'Guardar', 1000, '2026-11-10', '2026-11-10' from t
union all select hid, corrente, null, mercado, 'expense', 'Fora do intervalo', 99, '2026-12-01', '2026-12-01' from t;

set local role authenticated;
set local request.jwt.claims to '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "email": "ana@teste.local"}';

select results_eq(
  $$ select month, income_paid, income_pending, expense_paid, expense_pending
       from public.report_monthly_series((select hid from t), '2026-09-01', '2026-11-01') $$,
  $$ values ('2026-09-01'::date, 3000.00, 0.00, 500.00, 0.00),
            ('2026-10-01'::date,    0.00, 0.00,   0.00, 0.00),
            ('2026-11-01'::date, 3000.00, 0.00, 700.00, 200.00) $$,
  'um resumo por mês, com o mês vazio zerado, sem a transferência e sem dezembro'
);

select is(
  (select count(*)::int from public.report_monthly_series((select hid from t), '2026-09-17', '2026-11-03')),
  3,
  'qualquer dia do mês vale pelo mês inteiro'
);

select is(
  (select month from public.report_monthly_series((select hid from t), '2026-11-01', '2026-11-01')),
  '2026-11-01'::date,
  'intervalo de um mês só devolve aquele mês'
);

select is_empty(
  $$ select 1 from public.report_monthly_series((select hid from t), '2026-11-01', '2026-09-01') $$,
  'início depois do fim volta vazio'
);

set local request.jwt.claims to '{"sub": "bbbbbbbb-0000-0000-0000-000000000002", "email": "bruno@teste.local"}';

select is(
  (select sum(income_paid + expense_paid + expense_pending)
     from public.report_monthly_series((select hid from t), '2026-09-01', '2026-11-01')),
  0.00,
  'quem não é do espaço recebe tudo zerado (RLS)'
);

select * from finish();
rollback;

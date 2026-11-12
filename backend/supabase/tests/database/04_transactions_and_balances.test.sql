-- =============================================================================
-- Regras dos lançamentos (constraints e FKs compostas), saldo das contas
-- (view account_balances) e relatórios do mês.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'ana@teste.local', '{"name": "Ana"}'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bruno@teste.local', '{"name": "Bruno"}');

create temporary table t on commit drop as
select
  hm.household_id as hid,
  gen_random_uuid() as corrente,
  gen_random_uuid() as carteira,
  (select c.id from public.categories c where c.household_id = hm.household_id and c.name = 'Mercado') as mercado,
  (select c.id from public.categories c where c.household_id = hm.household_id and c.name = 'Salário') as salario,
  (select c.id from public.categories c
     join public.household_members b on b.household_id = c.household_id
    where b.user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and c.name = 'Mercado') as mercado_do_bruno,
  (select a.household_id from public.household_members a
    where a.user_id = 'bbbbbbbb-0000-0000-0000-000000000002') as hid_bruno,
  gen_random_uuid() as conta_do_bruno
from public.household_members hm
where hm.user_id = 'aaaaaaaa-0000-0000-0000-000000000001';

insert into public.accounts (id, household_id, name, initial_balance)
select corrente, hid, 'Corrente', 1000 from t
union all select carteira, hid, 'Carteira', 50 from t
union all select conta_do_bruno, hid_bruno, 'Conta do Bruno', 0 from t;

-- -----------------------------------------------------------------------------
-- Constraints
-- -----------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.transactions (household_id, account_id, category_id, type, description, amount)
     select hid, corrente, mercado, 'expense', 'Zero', 0 from t $$,
  '23514', null,
  'valor precisa ser maior que zero'
);

select throws_ok(
  $$ insert into public.transactions (household_id, account_id, type, description, amount)
     select hid, corrente, 'expense', 'Sem categoria', 10 from t $$,
  '23514', null,
  'despesa exige categoria'
);

select throws_ok(
  $$ insert into public.transactions (household_id, account_id, category_id, type, description, amount)
     select hid, corrente, salario, 'expense', 'Categoria de receita', 10 from t $$,
  '23503', null,
  'despesa não aceita categoria de receita (FK composta com o tipo)'
);

select throws_ok(
  $$ insert into public.transactions (household_id, account_id, category_id, type, description, amount)
     select hid, corrente, mercado_do_bruno, 'expense', 'Categoria alheia', 10 from t $$,
  '23503', null,
  'não aceita categoria de outro espaço'
);

select throws_ok(
  $$ insert into public.transactions (household_id, account_id, category_id, type, description, amount)
     select hid, conta_do_bruno, mercado, 'expense', 'Conta alheia', 10 from t $$,
  '23503', null,
  'não aceita conta de outro espaço'
);

select throws_ok(
  $$ insert into public.transactions (household_id, account_id, type, description, amount)
     select hid, corrente, 'transfer', 'Sem destino', 10 from t $$,
  '23514', null,
  'transferência exige conta de destino'
);

select throws_ok(
  $$ insert into public.transactions (household_id, account_id, destination_account_id, type, description, amount)
     select hid, corrente, corrente, 'transfer', 'Mesma conta', 10 from t $$,
  '23514', null,
  'transferência não pode ser para a mesma conta'
);

select throws_ok(
  $$ insert into public.transactions (household_id, account_id, destination_account_id, category_id, type, description, amount)
     select hid, corrente, carteira, mercado, 'transfer', 'Com categoria', 10 from t $$,
  '23514', null,
  'transferência não tem categoria'
);

select throws_ok(
  $$ insert into public.transactions (household_id, account_id, destination_account_id, type, description, amount)
     select hid, corrente, conta_do_bruno, 'transfer', 'Para fora', 10 from t $$,
  '23503', null,
  'transferência não sai do espaço'
);

-- -----------------------------------------------------------------------------
-- Saldos: só lançamentos pagos contam
-- -----------------------------------------------------------------------------
insert into public.transactions (household_id, account_id, destination_account_id, category_id, type, description, amount, due_date, payment_date)
select hid, corrente, null::uuid, salario, 'income'::public.transaction_type, 'Salário', 3000, '2026-11-05'::date, '2026-11-05'::date from t
union all select hid, corrente, null, mercado, 'expense', 'Mercado', 400, '2026-11-06', '2026-11-06' from t
union all select hid, corrente, null, mercado, 'expense', 'Mercado a pagar', 200, '2026-11-20', null from t
union all select hid, corrente, carteira, null, 'transfer', 'Saque', 100, '2026-11-07', '2026-11-07' from t
union all select hid, corrente, null, mercado, 'expense', 'Mês passado', 80, '2026-10-30', '2026-10-30' from t;

select results_eq(
  $$ select b.name::text, b.current_balance
       from public.account_balances b, t
      where b.household_id = t.hid
      order by b.name $$,
  $$ values ('Carteira', 150.00), ('Corrente', 3420.00) $$,
  'saldo = inicial + receitas - despesas -+ transferências, só com o que foi pago'
);

select throws_ok(
  $$ delete from public.accounts where id = (select corrente from t) $$,
  '23503', null,
  'conta com lançamentos não pode ser excluída'
);

select throws_ok(
  $$ delete from public.categories where id = (select mercado from t) $$,
  '23503', null,
  'categoria com lançamentos não pode ser excluída'
);

update public.categories set is_active = false where id = (select mercado from t);
select is(
  (select count(*)::int from public.transactions, t where category_id = t.mercado),
  3,
  'arquivar a categoria mantém os lançamentos dela'
);

-- -----------------------------------------------------------------------------
-- Relatórios do mês (pelo vencimento; transferências não entram)
-- -----------------------------------------------------------------------------
grant select on t to authenticated;
set local role authenticated;
set local request.jwt.claims to '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "email": "ana@teste.local"}';

select results_eq(
  $$ select income_paid, income_pending, expense_paid, expense_pending
       from public.report_monthly_summary((select hid from t), '2026-11-15') $$,
  $$ values (3000.00, 0.00, 400.00, 200.00) $$,
  'resumo de novembro separa pago e pendente e ignora transferência e outubro'
);

select results_eq(
  $$ select name::text, total from public.report_by_category((select hid from t), '2026-11-01', 'expense') $$,
  $$ values ('Mercado', 600.00) $$,
  'por categoria soma pago e pendente da categoria, mesmo arquivada'
);

select is_empty(
  $$ select 1 from public.report_by_category((select hid from t), '2026-12-01', 'expense') $$,
  'mês sem lançamentos volta vazio'
);

select results_eq(
  $$ select name::text, total from public.report_by_category((select hid from t), '2026-11-01', 'income') $$,
  $$ values ('Salário', 3000.00) $$,
  'receitas por categoria'
);

select * from finish();
rollback;

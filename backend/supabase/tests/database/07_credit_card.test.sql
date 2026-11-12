-- =============================================================================
-- Conta cartão de crédito: compras são despesas no cartão (saldo negativo =
-- fatura em aberto) e o pagamento da fatura é uma transferência para ele, que
-- zera a dívida sem contar a despesa duas vezes nos relatórios.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(5);

insert into auth.users (id, email, raw_user_meta_data)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'ana@teste.local', '{"name": "Ana"}');

create temporary table t on commit drop as
select
  hm.household_id as hid,
  gen_random_uuid() as corrente,
  gen_random_uuid() as cartao,
  (select c.id from public.categories c where c.household_id = hm.household_id and c.name = 'Mercado') as mercado
from public.household_members hm
where hm.user_id = 'aaaaaaaa-0000-0000-0000-000000000001';

select lives_ok(
  $$ insert into public.accounts (id, household_id, name, type, initial_balance)
     select corrente, hid, 'Corrente', 'checking'::public.account_type, 3000 from t
     union all select cartao, hid, 'Cartão', 'credit_card', -150 from t $$,
  'aceita conta do tipo credit_card, com fatura anterior como saldo inicial negativo'
);

insert into public.transactions (household_id, account_id, destination_account_id, category_id, type, description, amount, due_date, payment_date)
select hid, cartao, null::uuid, mercado, 'expense'::public.transaction_type, 'Mercado no cartão', 400, '2026-11-06'::date, '2026-11-06'::date from t
union all select hid, cartao, null, mercado, 'expense', 'Feira no cartão', 250, '2026-11-08', '2026-11-08' from t;

select results_eq(
  $$ select b.current_balance from public.account_balances b, t where b.account_id = t.cartao $$,
  $$ values (-800.00) $$,
  'compras no cartão aumentam a fatura em aberto (saldo mais negativo)'
);

insert into public.transactions (household_id, account_id, destination_account_id, type, description, amount, due_date, payment_date)
select hid, corrente, cartao, 'transfer', 'Pagamento da fatura', 800, '2026-11-10', '2026-11-10' from t;

select results_eq(
  $$ select b.name::text, b.current_balance
       from public.account_balances b, t
      where b.household_id = t.hid
      order by b.name $$,
  $$ values ('Cartão', 0.00), ('Corrente', 2200.00) $$,
  'pagar a fatura é uma transferência: zera o cartão e sai da corrente'
);

select results_eq(
  $$ select name::text, total from public.report_by_category((select hid from t), '2026-11-01', 'expense') $$,
  $$ values ('Mercado'::text, 650.00) $$,
  'o relatório conta as compras pela categoria e não conta o pagamento da fatura'
);

select throws_ok(
  $$ insert into public.transactions (household_id, account_id, destination_account_id, category_id, type, description, amount)
     select hid, corrente, cartao, mercado, 'transfer', 'Fatura com categoria', 10 from t $$,
  '23514', null,
  'pagamento da fatura (transferência) não aceita categoria'
);

select * from finish();
rollback;

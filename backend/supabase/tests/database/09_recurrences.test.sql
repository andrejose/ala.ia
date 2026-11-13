-- =============================================================================
-- Recorrências: materialize_recurrences() gera um lançamento por mês, até o
-- fim do mês seguinte, sem repetir mês e sem trazer de volta um mês excluído.
-- As datas são relativas a hoje (m0 = 1º dia do mês atual).
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
  gen_random_uuid() as aluguel,
  gen_random_uuid() as parcelas,
  gen_random_uuid() as debito,
  gen_random_uuid() as fim_do_mes,
  gen_random_uuid() as pausada,
  date_trunc('month', current_date)::date as m0,
  (select c.id from public.categories c where c.household_id = hm.household_id and c.name = 'Mercado') as mercado
from public.household_members hm
where hm.user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
grant select on t to authenticated;

insert into public.accounts (id, household_id, name)
select corrente, hid, 'Corrente' from t
union all select poupanca, hid, 'Poupança' from t;

insert into public.recurrences (id, household_id, account_id, category_id, type, description, amount, day_of_month, start_month, occurrences, auto_paid, is_active)
select aluguel, hid, corrente, mercado, 'expense'::public.transaction_type, 'Aluguel', 1800, 10, (m0 - interval '2 months')::date, null::int, false, true from t
union all select parcelas, hid, corrente, mercado, 'expense', 'Geladeira', 300, 5, (m0 - interval '1 month')::date, 3, false, true from t
union all select debito, hid, corrente, mercado, 'expense', 'Academia', 99.9, 1, (m0 - interval '1 month')::date, null, true, true from t
union all select fim_do_mes, hid, corrente, mercado, 'expense', 'Fim do mês', 10, 31, m0, null, false, true from t
union all select pausada, hid, corrente, mercado, 'expense', 'Pausada', 10, 1, m0, null, false, false from t;

-- -----------------------------------------------------------------------------
select is(
  public.materialize_recurrences((select hid from t)),
  4 + 3 + 2 + 2,
  'gera aluguel (4 meses), parcelas (3), débito automático (2, só até hoje) e fim do mês (2); a pausada não'
);

select results_eq(
  $$ select tx.due_date, tx.payment_date, tx.recurrence_month
       from public.transactions tx, t where tx.recurrence_id = t.aluguel order by tx.due_date $$,
  $$ select (m0 - interval '2 months' + interval '9 days')::date, null::date, (m0 - interval '2 months')::date from t
     union all select (m0 - interval '1 month' + interval '9 days')::date, null, (m0 - interval '1 month')::date from t
     union all select (m0 + interval '9 days')::date, null, m0 from t
     union all select (m0 + interval '1 month' + interval '9 days')::date, null, (m0 + interval '1 month')::date from t $$,
  'sem débito automático, cada mês entra pendente no dia escolhido, até o mês seguinte'
);

select results_eq(
  $$ select tx.description::text from public.transactions tx, t where tx.recurrence_id = t.parcelas order by tx.due_date $$,
  $$ values ('Geladeira (1/3)'), ('Geladeira (2/3)'), ('Geladeira (3/3)') $$,
  'parcelas numeradas e só até a última'
);

select ok(
  (select bool_and(tx.payment_date = tx.due_date and tx.due_date <= current_date)
     from public.transactions tx, t where tx.recurrence_id = t.debito),
  'débito automático entra pago, e só os dias que já chegaram'
);

select ok(
  (select bool_and(tx.due_date = (tx.recurrence_month + interval '1 month - 1 day')::date)
     from public.transactions tx, t where tx.recurrence_id = t.fim_do_mes),
  'dia 31 em mês mais curto cai no último dia do mês'
);

select is(
  public.materialize_recurrences((select hid from t)),
  0,
  'chamar de novo não gera nada: cada mês uma vez só'
);

-- Pular um mês: o lançamento excluído não volta
delete from public.transactions tx using t
 where tx.recurrence_id = t.aluguel and tx.recurrence_month = t.m0;

select is(public.materialize_recurrences((select hid from t)), 0, 'mês excluído não é gerado de novo');

-- Reativar a pausada gera a partir do início dela
update public.recurrences set is_active = true where id = (select pausada from t);
select is(public.materialize_recurrences((select hid from t)), 2, 'reativada, a regra passa a gerar');

-- Excluir a regra mantém os lançamentos, sem o vínculo
delete from public.recurrences where id = (select parcelas from t);
select is(
  (select count(*)::int from public.transactions tx, t
    where tx.household_id = t.hid and tx.description like 'Geladeira%' and tx.recurrence_id is null),
  3,
  'excluir a regra mantém os lançamentos já gerados'
);

select throws_ok(
  $$ insert into public.recurrences (household_id, account_id, destination_account_id, category_id, type, description, amount, day_of_month, start_month)
     select hid, corrente, poupanca, mercado, 'transfer', 'Guardar', 100, 5, m0 from t $$,
  '23514', null,
  'transferência recorrente não aceita categoria (mesma regra dos lançamentos)'
);

select throws_ok(
  $$ insert into public.recurrences (household_id, account_id, category_id, type, description, amount, day_of_month, start_month)
     select hid, corrente, mercado, 'expense', 'Dia 15', 100, 5, (m0 + interval '14 days')::date from t $$,
  '23514', null,
  'start_month precisa ser o 1º dia do mês'
);

-- RLS: quem é de fora não vê nem gera as recorrências de outro household
set local role authenticated;
set local request.jwt.claims = '{"sub": "bbbbbbbb-0000-0000-0000-000000000002", "role": "authenticated"}';

select is(
  public.materialize_recurrences((select hid from t)) + (select count(*)::int from public.recurrences),
  0,
  'quem é de fora não vê nem gera recorrências do household alheio'
);

reset role;

select * from finish();
rollback;

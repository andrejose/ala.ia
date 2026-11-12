-- =============================================================================
-- Importação de extratos: import_hash é único por conta, para reimportar o
-- mesmo extrato não duplicar nada. Lançamentos feitos à mão (nulo) não colidem.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(4);

insert into auth.users (id, email, raw_user_meta_data)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'ana@teste.local', '{"name": "Ana"}');

create temporary table t on commit drop as
select
  hm.household_id as hid,
  gen_random_uuid() as bb,
  gen_random_uuid() as santander,
  (select c.id from public.categories c where c.household_id = hm.household_id and c.name = 'Mercado') as mercado
from public.household_members hm
where hm.user_id = 'aaaaaaaa-0000-0000-0000-000000000001';

insert into public.accounts (id, household_id, name)
select bb, hid, 'BB' from t
union all select santander, hid, 'Santander' from t;

insert into public.transactions (household_id, account_id, category_id, type, description, amount, import_hash)
select hid, bb, mercado, 'expense', 'Mercado', 10, repeat('a', 64) from t;

select throws_ok(
  $$ insert into public.transactions (household_id, account_id, category_id, type, description, amount, import_hash)
     select hid, bb, mercado, 'expense', 'Mercado de novo', 10, repeat('a', 64) from t $$,
  '23505', null,
  'a mesma linha do extrato não entra duas vezes na mesma conta'
);

select lives_ok(
  $$ insert into public.transactions (household_id, account_id, category_id, type, description, amount, import_hash)
     select hid, santander, mercado, 'expense', 'Mercado', 10, repeat('a', 64) from t $$,
  'o mesmo identificador em outra conta é outra linha'
);

select lives_ok(
  $$ insert into public.transactions (household_id, account_id, category_id, type, description, amount)
     select hid, bb, mercado, 'expense'::public.transaction_type, 'À mão', 10 from t
     union all select hid, bb, mercado, 'expense', 'À mão', 10 from t $$,
  'lançamentos sem import_hash (feitos à mão) não colidem'
);

select results_eq(
  $$ select count(*)::int from public.transactions t2, t
      where t2.account_id = t.bb and t2.import_hash is null $$,
  $$ values (2) $$,
  'os dois lançamentos à mão foram gravados'
);

select * from finish();
rollback;

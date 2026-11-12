-- =============================================================================
-- Triggers de regra:
--   ensure_household_has_owner -> todo espaço precisa de pelo menos um dono
--   set_transaction_author     -> o autor do lançamento é quem está logado
--
-- "Logar" como alguém = set local role authenticated + claims do JWT.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(11);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'ana@teste.local', '{"name": "Ana"}'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bruno@teste.local', '{"name": "Bruno"}');

-- Espaço da Ana, com o Bruno como membro
create temporary table ctx on commit drop as
select household_id as hid
  from public.household_members
 where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
grant select on ctx to authenticated;

insert into public.household_members (household_id, user_id, role)
select hid, 'bbbbbbbb-0000-0000-0000-000000000002', 'member' from ctx;

-- -----------------------------------------------------------------------------
-- Dono do espaço
-- -----------------------------------------------------------------------------
select throws_ok(
  $$ update public.household_members set role = 'member'
      where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and household_id = (select hid from ctx) $$,
  'AL001',
  null,
  'o único dono não pode virar membro'
);

select throws_ok(
  $$ delete from public.household_members
      where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and household_id = (select hid from ctx) $$,
  'AL001',
  null,
  'o único dono não pode sair do espaço'
);

select lives_ok(
  $$ delete from public.household_members
      where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and household_id = (select hid from ctx) $$,
  'um membro pode sair'
);

insert into public.household_members (household_id, user_id, role)
select hid, 'bbbbbbbb-0000-0000-0000-000000000002', 'owner' from ctx;

select lives_ok(
  $$ update public.household_members set role = 'member'
      where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and household_id = (select hid from ctx) $$,
  'com outro dono, o primeiro pode virar membro'
);

select throws_ok(
  $$ update public.household_members set role = 'member'
      where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and household_id = (select hid from ctx) $$,
  'AL001',
  null,
  'o novo único dono também fica protegido'
);

select lives_ok(
  $$ delete from public.households where id = (select hid from ctx) $$,
  'excluir o espaço apaga os membros em cascata, sem esbarrar na regra do dono'
);

-- -----------------------------------------------------------------------------
-- Autor do lançamento
-- -----------------------------------------------------------------------------
create temporary table ids on commit drop as
select
  hm.household_id as hid,
  gen_random_uuid() as account_id,
  (select c.id from public.categories c where c.household_id = hm.household_id and c.name = 'Mercado') as category_id,
  gen_random_uuid() as tx_id
from public.household_members hm
where hm.user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
grant select on ids to authenticated;

-- Ana entra no espaço pessoal do Bruno, para os dois poderem lançar nele
insert into public.household_members (household_id, user_id, role)
select hid, 'aaaaaaaa-0000-0000-0000-000000000001', 'member' from ids;
insert into public.accounts (id, household_id, name)
select account_id, hid, 'Conta' from ids;

set local role authenticated;
set local request.jwt.claims to '{"sub": "bbbbbbbb-0000-0000-0000-000000000002", "email": "bruno@teste.local"}';

-- Bruno tenta lançar em nome da Ana
insert into public.transactions (id, household_id, account_id, category_id, type, description, amount, user_id)
select tx_id, hid, account_id, category_id, 'expense', 'Feira', 50, 'aaaaaaaa-0000-0000-0000-000000000001' from ids;

select is(
  (select user_id from public.transactions where id = (select tx_id from ids)),
  'bbbbbbbb-0000-0000-0000-000000000002'::uuid,
  'no insert, o autor é sempre quem está logado, mesmo enviando outro user_id'
);

set local request.jwt.claims to '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "email": "ana@teste.local"}';

update public.transactions set user_id = 'aaaaaaaa-0000-0000-0000-000000000001', description = 'Feira da semana'
 where id = (select tx_id from ids);

select results_eq(
  $$ select user_id, description::text from public.transactions where id = (select tx_id from ids) $$,
  $$ values ('bbbbbbbb-0000-0000-0000-000000000002'::uuid, 'Feira da semana') $$,
  'outro membro edita o lançamento, mas não troca o autor'
);

update public.transactions set user_id = null where id = (select tx_id from ids);

select is(
  (select user_id from public.transactions where id = (select tx_id from ids)),
  null,
  'o autor pode virar null (é o que a FK faz quando o perfil é excluído)'
);

reset role;

-- Sem usuário logado (ex.: service role em scripts), o valor enviado é mantido
reset request.jwt.claims;
insert into public.transactions (household_id, account_id, category_id, type, description, amount, user_id)
select hid, account_id, category_id, 'expense', 'Importado', 10, 'aaaaaaaa-0000-0000-0000-000000000001' from ids;

select is(
  (select user_id from public.transactions where description = 'Importado'),
  'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
  'sem usuário logado, o user_id informado é mantido'
);

delete from auth.users where id = 'aaaaaaaa-0000-0000-0000-000000000001';

select is(
  (select user_id from public.transactions where description = 'Importado'),
  null,
  'excluir o autor deixa o lançamento sem autor, sem apagá-lo'
);

select * from finish();
rollback;

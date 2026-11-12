-- =============================================================================
-- RLS: cada pessoa só vê e mexe nos dados dos espaços de que participa.
-- Ana tem um espaço com conta, categoria, lançamento e convite. Bruno, de fora,
-- e o anônimo não podem ler nem alterar nada disso.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(25);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'ana@teste.local', '{"name": "Ana"}'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bruno@teste.local', '{"name": "Bruno"}'),
  ('cccccccc-0000-0000-0000-000000000003', 'carla@teste.local', '{"name": "Carla"}');

create temporary table ana on commit drop as
select
  hm.household_id as hid,
  gen_random_uuid() as account_id,
  (select c.id from public.categories c where c.household_id = hm.household_id and c.name = 'Mercado') as category_id
from public.household_members hm
where hm.user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
grant select on ana to authenticated, anon;

insert into public.accounts (id, household_id, name, initial_balance)
select account_id, hid, 'Conta da Ana', 100 from ana;
insert into public.transactions (household_id, account_id, category_id, type, description, amount, payment_date)
select hid, account_id, category_id, 'expense', 'Feira', 30, current_date from ana;
insert into public.household_invitations (household_id, email, invited_by)
select hid, 'convidado@teste.local', 'aaaaaaaa-0000-0000-0000-000000000001' from ana;
-- Carla é membro do espaço da Ana
insert into public.household_members (household_id, user_id, role)
select hid, 'cccccccc-0000-0000-0000-000000000003', 'member' from ana;

-- -----------------------------------------------------------------------------
-- Bruno (logado, mas de fora) não vê nada da Ana
-- -----------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub": "bbbbbbbb-0000-0000-0000-000000000002", "email": "bruno@teste.local"}';

select is_empty($$ select 1 from public.households where id = (select hid from ana) $$, 'Bruno não vê o espaço da Ana');
select is_empty($$ select 1 from public.household_members where household_id = (select hid from ana) $$, 'nem os membros');
select is_empty($$ select 1 from public.accounts where household_id = (select hid from ana) $$, 'nem as contas');
select is_empty($$ select 1 from public.account_balances where household_id = (select hid from ana) $$, 'nem os saldos');
select is_empty($$ select 1 from public.categories where household_id = (select hid from ana) $$, 'nem as categorias');
select is_empty($$ select 1 from public.transactions where household_id = (select hid from ana) $$, 'nem os lançamentos');
select is_empty($$ select 1 from public.household_invitations where household_id = (select hid from ana) $$, 'nem os convites');
select is_empty($$ select 1 from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$, 'nem o perfil da Ana');
select is_empty(
  $$ select 1 from public.report_monthly_summary((select hid from ana), current_date)
      where expense_paid > 0 $$,
  'os relatórios do espaço da Ana voltam zerados para ele'
);

select throws_ok(
  $$ insert into public.accounts (household_id, name) select hid, 'Invasão' from ana $$,
  '42501',
  null,
  'Bruno não cria conta no espaço da Ana'
);

select throws_ok(
  $$ insert into public.household_members (household_id, user_id, role)
     select hid, 'bbbbbbbb-0000-0000-0000-000000000002', 'owner' from ana $$,
  '42501',
  null,
  'Bruno não se coloca como membro do espaço da Ana'
);

update public.accounts set name = 'Alterada' where household_id = (select hid from ana);
delete from public.transactions where household_id = (select hid from ana);
delete from public.households where id = (select hid from ana);

reset role;
select results_eq(
  $$ select
       (select name::text from public.accounts where id = (select account_id from ana)),
       (select count(*)::int from public.transactions where household_id = (select hid from ana)),
       (select count(*)::int from public.households where id = (select hid from ana)) $$,
  $$ values ('Conta da Ana', 1, 1) $$,
  'updates e deletes do Bruno não afetam nada no espaço da Ana'
);

-- -----------------------------------------------------------------------------
-- Carla (membro) vê e lança, mas não administra o espaço
-- -----------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub": "cccccccc-0000-0000-0000-000000000003", "email": "carla@teste.local"}';

select is(
  (select count(*)::int from public.transactions where household_id = (select hid from ana)),
  1,
  'Carla, membro, vê os lançamentos do espaço'
);
select is(
  (select current_balance from public.account_balances where account_id = (select account_id from ana)),
  70.00,
  'e o saldo da conta'
);
select isnt_empty(
  $$ select 1 from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  'e o perfil da Ana, com quem divide o espaço'
);
select lives_ok(
  $$ insert into public.transactions (household_id, account_id, category_id, type, description, amount)
     select hid, account_id, category_id, 'expense', 'Padaria', 12 from ana $$,
  'Carla lança no espaço'
);

update public.households set name = 'Tomado' where id = (select hid from ana);
update public.household_members set role = 'owner'
 where household_id = (select hid from ana) and user_id = 'cccccccc-0000-0000-0000-000000000003';
delete from public.household_members
 where household_id = (select hid from ana) and user_id = 'aaaaaaaa-0000-0000-0000-000000000001';

reset role;
select results_eq(
  $$ select h.name::text,
            (select role::text from public.household_members
              where household_id = h.id and user_id = 'cccccccc-0000-0000-0000-000000000003'),
            (select count(*)::int from public.household_members
              where household_id = h.id and user_id = 'aaaaaaaa-0000-0000-0000-000000000001')
       from public.households h where h.id = (select hid from ana) $$,
  $$ values ('Pessoal', 'member', 1) $$,
  'membro não renomeia o espaço, não se promove a dono e não remove a dona'
);

set local role authenticated;
set local request.jwt.claims to '{"sub": "cccccccc-0000-0000-0000-000000000003", "email": "carla@teste.local"}';
delete from public.household_members
 where household_id = (select hid from ana) and user_id = 'cccccccc-0000-0000-0000-000000000003';
reset role;

select is_empty(
  $$ select 1 from public.household_members
      where household_id = (select hid from ana) and user_id = 'cccccccc-0000-0000-0000-000000000003' $$,
  'mas pode sair do espaço por conta própria'
);

-- -----------------------------------------------------------------------------
-- Ana, dona, administra o próprio espaço
-- -----------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "email": "ana@teste.local"}';

update public.households set name = 'Casa' where id = (select hid from ana);
select is(
  (select name::text from public.households where id = (select hid from ana)),
  'Casa',
  'a dona renomeia o espaço'
);
select is(
  (select count(*)::int from public.household_invitations where household_id = (select hid from ana)),
  1,
  'e vê os convites do espaço'
);
select throws_ok(
  $$ insert into public.household_invitations (household_id, email)
     select hid, 'direto@teste.local' from ana $$,
  '42501',
  null,
  'convites não são criados direto na tabela, só pela função invite_member'
);
select throws_ok(
  $$ insert into public.households (name) values ('Direto') $$,
  '42501',
  null,
  'espaços não são criados direto na tabela, só pela função create_household'
);

-- -----------------------------------------------------------------------------
-- Anônimo não vê nada
-- -----------------------------------------------------------------------------
reset role;
reset request.jwt.claims;
set local role anon;

select is_empty($$ select 1 from public.households $$, 'anônimo não vê espaços');
select is_empty($$ select 1 from public.accounts $$, 'nem contas');
select is_empty($$ select 1 from public.transactions $$, 'nem lançamentos');

select * from finish();
rollback;

-- =============================================================================
-- Convites (funções invite_member, my_invitations, accept_invitation,
-- decline_invitation e cancel_invitation) e os erros que a API traduz.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'ana@teste.local', '{"name": "Ana"}'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bruno@teste.local', '{"name": "Bruno"}'),
  ('cccccccc-0000-0000-0000-000000000003', 'carla@teste.local', '{"name": "Carla"}');

create temporary table ctx (hid uuid, convite_bruno uuid, convite_carla uuid) on commit drop;
insert into ctx (hid)
select household_id from public.household_members where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
grant select, update on ctx to authenticated;

-- -----------------------------------------------------------------------------
-- Ana (dona) convida
-- -----------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "email": "ana@teste.local"}';

update ctx set convite_bruno = public.invite_member((select hid from ctx), '  Bruno@Teste.local ', 'member');

select is(
  (select email::text from public.household_invitations where id = (select convite_bruno from ctx)),
  'bruno@teste.local',
  'o e-mail do convite é guardado sem espaços e em minúsculas'
);

select throws_ok(
  $$ select public.invite_member((select hid from ctx), 'bruno@teste.local', 'member') $$,
  '23505', null,
  'não cria um segundo convite pendente para o mesmo e-mail'
);

select throws_ok(
  $$ select public.invite_member((select hid from ctx), 'ana@teste.local', 'member') $$,
  '22023', null,
  'não convida o próprio e-mail'
);

update ctx set convite_carla = public.invite_member((select hid from ctx), 'carla@teste.local', 'owner');

-- -----------------------------------------------------------------------------
-- Bruno, convidado, ainda não é membro
-- -----------------------------------------------------------------------------
set local request.jwt.claims to '{"sub": "bbbbbbbb-0000-0000-0000-000000000002", "email": "bruno@teste.local"}';

select throws_ok(
  $$ select public.invite_member((select hid from ctx), 'outro@teste.local', 'member') $$,
  '42501', null,
  'quem não é dono não convida'
);

select results_eq(
  $$ select household_name::text, role::text, invited_by::text from public.my_invitations() $$,
  $$ values ('Pessoal', 'member', 'Ana') $$,
  'o convidado vê o próprio convite, com o nome do espaço e de quem convidou'
);

select throws_ok(
  $$ select public.accept_invitation((select convite_carla from ctx)) $$,
  'P0002', null,
  'não aceita convite que é para outro e-mail'
);

select throws_ok(
  $$ select public.cancel_invitation((select convite_bruno from ctx)) $$,
  'P0002', null,
  'o convidado não cancela o convite (para ele, o convite não existe no espaço)'
);

select is(
  public.accept_invitation((select convite_bruno from ctx)),
  (select hid from ctx),
  'aceitar devolve o espaço'
);

select results_eq(
  $$ select role::text from public.household_members
      where household_id = (select hid from ctx) and user_id = 'bbbbbbbb-0000-0000-0000-000000000002' $$,
  $$ values ('member') $$,
  'ao aceitar, entra no espaço com o papel do convite'
);

select throws_ok(
  $$ select public.accept_invitation((select convite_bruno from ctx)) $$,
  'AL002', null,
  'convite já respondido não pode ser aceito de novo'
);

select is_empty($$ select 1 from public.my_invitations() $$, 'convite aceito sai da lista do convidado');

select throws_ok(
  $$ select public.invite_member((select hid from ctx), 'carla@teste.local', 'member') $$,
  '42501', null,
  'membro, sem ser dono, continua sem poder convidar'
);

-- -----------------------------------------------------------------------------
-- Carla recusa; um convite novo para ela depois cancelado pela Ana
-- -----------------------------------------------------------------------------
set local request.jwt.claims to '{"sub": "cccccccc-0000-0000-0000-000000000003", "email": "carla@teste.local"}';
select public.decline_invitation((select convite_carla from ctx));

select is_empty(
  $$ select 1 from public.household_members
      where household_id = (select hid from ctx) and user_id = 'cccccccc-0000-0000-0000-000000000003' $$,
  'quem recusa não entra no espaço'
);

set local request.jwt.claims to '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "email": "ana@teste.local"}';

select throws_ok(
  $$ select public.invite_member((select hid from ctx), 'bruno@teste.local', 'member') $$,
  '23505', null,
  'não convida quem já é membro'
);

update ctx set convite_carla = public.invite_member((select hid from ctx), 'carla@teste.local', 'member');
select public.cancel_invitation((select convite_carla from ctx));

set local request.jwt.claims to '{"sub": "cccccccc-0000-0000-0000-000000000003", "email": "carla@teste.local"}';
select throws_ok(
  $$ select public.accept_invitation((select convite_carla from ctx)) $$,
  'AL002', null,
  'convite cancelado não pode ser aceito'
);

-- -----------------------------------------------------------------------------
-- Expiração
-- -----------------------------------------------------------------------------
reset role;
update public.household_invitations set status = 'pending', responded_at = null, expires_at = now() - interval '1 day'
 where id = (select convite_carla from ctx);
set local role authenticated;

select throws_ok(
  $$ select public.accept_invitation((select convite_carla from ctx)) $$,
  'AL002', null,
  'convite vencido não pode ser aceito'
);

set local request.jwt.claims to '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "email": "ana@teste.local"}';
select lives_ok(
  $$ select public.invite_member((select hid from ctx), 'carla@teste.local', 'member') $$,
  'um convite vencido não impede convidar de novo'
);

select * from finish();
rollback;

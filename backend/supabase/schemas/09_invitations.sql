-- =============================================================================
-- 09_invitations.sql
-- Convites para participar de um household, no estilo do GitHub:
--   1. o dono convida por e-mail (invite_member) -> convite pendente;
--   2. a pessoa convidada vê o convite (my_invitations) e aceita
--      (accept_invitation) ou recusa (decline_invitation);
--   3. o dono pode cancelar enquanto estiver pendente (cancel_invitation).
--
-- O convite vale para o e-mail, mesmo que ainda não exista conta com ele: fica
-- esperando a pessoa se cadastrar. Assim o convite não revela se um e-mail
-- tem cadastro. Convites expiram em 7 dias.
--
-- ATENÇÃO: o aceite confia no e-mail da conta. Em produção, deixe a
-- confirmação de e-mail ligada no Supabase Auth, para ninguém criar conta com
-- o e-mail de outra pessoa e aceitar um convite que não era para ela.
--
-- Erros (SQLSTATE), traduzidos pela API:
--   42501 -> quem chamou não é dono do household (403)
--   P0002 -> convite não encontrado, ou não é para você (404)
--   23505 -> já é membro, ou já existe convite pendente para o e-mail (409)
--   22023 -> convite para o próprio e-mail (400)
--   AL002 -> convite expirado ou já respondido (410)
-- =============================================================================

create table public.household_invitations (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  email        varchar(255) not null,
  role         public.member_role not null default 'member',
  invited_by   uuid references public.profiles (id) on delete set null,
  status       varchar(10) not null default 'pending',
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '7 days',
  responded_at timestamptz,

  constraint household_invitations_email_chk check (email = lower(trim(email))),
  constraint household_invitations_status_chk
    check (status in ('pending', 'accepted', 'declined', 'canceled'))
);

-- Um convite pendente por e-mail em cada household
create unique index household_invitations_pending_key
  on public.household_invitations (household_id, email)
  where status = 'pending';

create index household_invitations_email_idx on public.household_invitations (email);

-- -----------------------------------------------------------------------------
-- RLS: membros veem os convites do household; a pessoa convidada vê os seus.
-- Criar e responder convites só pelas funções abaixo (sem políticas de escrita).
-- -----------------------------------------------------------------------------
alter table public.household_invitations enable row level security;

create policy "Membros e convidados veem os convites"
  on public.household_invitations for select
  to authenticated
  using (
    (select public.is_household_member(household_id))
    or email = lower((select auth.jwt() ->> 'email'))
  );

-- E-mail da conta logada (auth.users), em minúsculas
create or replace function public.current_user_email()
returns varchar
language sql
stable
security definer
set search_path = ''
as $$
  select lower(email) from auth.users where id = (select auth.uid());
$$;

-- -----------------------------------------------------------------------------
-- Convida um e-mail para o household. Só o dono. Retorna o id do convite.
-- Uso: supabase.rpc('invite_member', { p_household_id, p_email, p_role })
-- -----------------------------------------------------------------------------
create or replace function public.invite_member(
  p_household_id uuid,
  p_email        varchar,
  p_role         public.member_role default 'member'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email         varchar := lower(trim(p_email));
  v_invitation_id uuid;
begin
  if not public.is_household_owner(p_household_id) then
    raise exception 'Apenas o dono do household pode convidar membros.'
      using errcode = '42501';
  end if;

  if v_email = public.current_user_email() then
    raise exception 'Você já faz parte deste household.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.household_members hm
    join auth.users u on u.id = hm.user_id
    where hm.household_id = p_household_id
      and lower(u.email) = v_email
  ) then
    raise exception 'Esta pessoa já é membro do household.'
      using errcode = '23505';
  end if;

  -- Convite pendente vencido não bloqueia um novo
  update public.household_invitations
     set status = 'canceled', responded_at = now()
   where household_id = p_household_id
     and email = v_email
     and status = 'pending'
     and expires_at <= now();

  if exists (
    select 1 from public.household_invitations
    where household_id = p_household_id and email = v_email and status = 'pending'
  ) then
    raise exception 'Já existe um convite pendente para este e-mail.'
      using errcode = '23505';
  end if;

  insert into public.household_invitations (household_id, email, role, invited_by)
  values (p_household_id, v_email, p_role, (select auth.uid()))
  returning id into v_invitation_id;

  return v_invitation_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Convites pendentes para o e-mail do usuário logado, com o nome do household
-- e de quem convidou (a pessoa ainda não é membro, então o RLS esconderia).
-- Uso: supabase.rpc('my_invitations')
-- -----------------------------------------------------------------------------
create or replace function public.my_invitations()
returns table (
  id             uuid,
  household_id   uuid,
  household_name varchar,
  role           public.member_role,
  invited_by     varchar,
  created_at     timestamptz,
  expires_at     timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.household_id, h.name, i.role, p.name, i.created_at, i.expires_at
  from public.household_invitations i
  join public.households h on h.id = i.household_id
  left join public.profiles p on p.id = i.invited_by
  where i.email = public.current_user_email()
    and i.status = 'pending'
    and i.expires_at > now()
  order by i.created_at desc;
$$;

-- Busca o convite pendente do usuário logado (uso interno de aceitar/recusar)
create or replace function public.lock_my_invitation(p_invitation_id uuid)
returns public.household_invitations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.household_invitations;
begin
  select * into v_invitation
  from public.household_invitations
  where id = p_invitation_id
    and email = public.current_user_email()
  for update;

  if v_invitation.id is null then
    raise exception 'Convite não encontrado.' using errcode = 'P0002';
  end if;

  if v_invitation.status <> 'pending' then
    raise exception 'Este convite já foi respondido ou cancelado.' using errcode = 'AL002';
  end if;

  if v_invitation.expires_at <= now() then
    raise exception 'Este convite expirou. Peça um novo para quem convidou.' using errcode = 'AL002';
  end if;

  return v_invitation;
end;
$$;

-- -----------------------------------------------------------------------------
-- Aceita o convite: entra no household com o papel do convite.
-- Uso: supabase.rpc('accept_invitation', { p_invitation_id })
-- -----------------------------------------------------------------------------
create or replace function public.accept_invitation(p_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.household_invitations := public.lock_my_invitation(p_invitation_id);
begin
  insert into public.household_members (household_id, user_id, role)
  values (v_invitation.household_id, (select auth.uid()), v_invitation.role)
  on conflict (household_id, user_id) do nothing;

  update public.household_invitations
     set status = 'accepted', responded_at = now()
   where id = v_invitation.id;

  return v_invitation.household_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Recusa o convite.
-- Uso: supabase.rpc('decline_invitation', { p_invitation_id })
-- -----------------------------------------------------------------------------
create or replace function public.decline_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.household_invitations := public.lock_my_invitation(p_invitation_id);
begin
  update public.household_invitations
     set status = 'declined', responded_at = now()
   where id = v_invitation.id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Cancela um convite pendente. Só o dono do household.
-- Uso: supabase.rpc('cancel_invitation', { p_invitation_id })
-- -----------------------------------------------------------------------------
create or replace function public.cancel_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
begin
  select household_id into v_household_id
  from public.household_invitations
  where id = p_invitation_id and status = 'pending';

  if v_household_id is null or not public.is_household_member(v_household_id) then
    raise exception 'Convite não encontrado.' using errcode = 'P0002';
  end if;

  if not public.is_household_owner(v_household_id) then
    raise exception 'Apenas o dono do household pode cancelar convites.' using errcode = '42501';
  end if;

  update public.household_invitations
     set status = 'canceled', responded_at = now()
   where id = p_invitation_id;
end;
$$;

-- =============================================================================
-- 02_users_and_households.sql
-- Perfis de usuário e households (grupos de compartilhamento, ex.: um casal).
--
-- Autenticação (email, senha, recuperação de senha) fica a cargo do
-- Supabase Auth (tabela auth.users). Por isso NÃO existe "password_hash" aqui:
-- a tabela "profiles" guarda apenas os dados públicos do usuário.
--
-- Todos os dados financeiros (contas, categorias, transações) pertencem a um
-- HOUSEHOLD. Compartilhar o acesso = adicionar outro usuário ao household.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- profiles: 1 para 1 com auth.users (criado automaticamente no cadastro)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       varchar(100) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- households: "carteira" compartilhada que agrupa contas, categorias e transações
-- -----------------------------------------------------------------------------
create table public.households (
  id         uuid primary key default gen_random_uuid(),
  name       varchar(100) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger households_set_updated_at
  before update on public.households
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- household_members: quais usuários têm acesso a quais households (N para N)
-- -----------------------------------------------------------------------------
create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  role         public.member_role not null default 'member',
  created_at   timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index household_members_user_id_idx on public.household_members (user_id);

-- -----------------------------------------------------------------------------
-- Todo household precisa de pelo menos um dono (owner).
-- Impede que o único owner saia, seja removido ou seja rebaixado a member.
-- Exclusões em cascata (o household ou o usuário sendo excluído) são permitidas.
-- Erro com SQLSTATE próprio 'AL001', que a API traduz para 409.
-- -----------------------------------------------------------------------------
create or replace function public.ensure_household_has_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Só interessa quando um owner deixa de ser owner daquele household
  if old.role <> 'owner'
     or (tg_op = 'UPDATE' and new.role = 'owner' and new.household_id = old.household_id) then
    return coalesce(new, old);
  end if;

  -- Cascata: o household ou o perfil do usuário já foi excluído nesta transação
  if not exists (select 1 from public.households where id = old.household_id)
     or not exists (select 1 from public.profiles where id = old.user_id) then
    return coalesce(new, old);
  end if;

  if not exists (
    select 1
    from public.household_members
    where household_id = old.household_id
      and role = 'owner'
      and user_id <> old.user_id
  ) then
    raise exception 'O household precisa de pelo menos um dono. Promova outro membro a dono antes ou exclua o household.'
      using errcode = 'AL001';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger household_members_ensure_owner
  before update or delete on public.household_members
  for each row execute function public.ensure_household_has_owner();

-- -----------------------------------------------------------------------------
-- Funções auxiliares usadas nas políticas de RLS.
-- SECURITY DEFINER evita recursão infinita ao consultar household_members
-- dentro das próprias políticas de household_members.
-- -----------------------------------------------------------------------------
create or replace function public.is_household_member(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = p_household_id
      and user_id = (select auth.uid())
  );
$$;

create or replace function public.is_household_owner(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = p_household_id
      and user_id = (select auth.uid())
      and role = 'owner'
  );
$$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.households        enable row level security;
alter table public.household_members enable row level security;

-- profiles: o usuário vê o próprio perfil e o de quem divide household com ele
create policy "Ver próprio perfil e de membros dos meus households"
  on public.profiles for select
  to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1
      from public.household_members hm
      where hm.user_id = profiles.id
        and (select public.is_household_member(hm.household_id))
    )
  );

create policy "Editar próprio perfil"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- households: membros veem; apenas o dono edita/exclui.
-- A criação é feita pela função public.create_household() (07_functions.sql).
create policy "Membros veem o household"
  on public.households for select
  to authenticated
  using ((select public.is_household_member(id)));

create policy "Dono edita o household"
  on public.households for update
  to authenticated
  using ((select public.is_household_owner(id)))
  with check ((select public.is_household_owner(id)));

create policy "Dono exclui o household"
  on public.households for delete
  to authenticated
  using ((select public.is_household_owner(id)));

-- household_members: membros veem os colegas; dono altera papéis e remove;
-- qualquer membro pode sair do household.
-- A inclusão é feita pela função public.invite_member() (07_functions.sql).
create policy "Membros veem os membros do household"
  on public.household_members for select
  to authenticated
  using ((select public.is_household_member(household_id)));

create policy "Dono altera papel dos membros"
  on public.household_members for update
  to authenticated
  using ((select public.is_household_owner(household_id)))
  with check ((select public.is_household_owner(household_id)));

create policy "Dono remove membros ou o próprio usuário sai"
  on public.household_members for delete
  to authenticated
  using (
    (select public.is_household_owner(household_id))
    or user_id = (select auth.uid())
  );


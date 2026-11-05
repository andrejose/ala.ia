-- =============================================================================
-- 07_functions.sql
-- Funções de negócio (chamadas via supabase.rpc) e rotina de novo cadastro.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Cadastro: ao criar um usuário no Supabase Auth, cria o perfil, um household
-- pessoal e torna o usuário dono (owner) desse household.
--
-- O nome vem dos metadados do signUp:
--   supabase.auth.signUp({ email, password, options: { data: { name } } })
--
-- ATENÇÃO: o trigger em auth.users NÃO é capturado pelo "supabase db diff"
-- (schema auth é gerenciado pelo Supabase). Crie-o em uma migration manual:
--   npx supabase migration new on_auth_user_created
-- com o conteúdo:
--   create trigger on_auth_user_created
--     after insert on auth.users
--     for each row execute function public.handle_new_user();
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
  v_name         varchar(100);
begin
  v_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    split_part(new.email, '@', 1)
  );

  insert into public.profiles (id, name)
  values (new.id, v_name);

  insert into public.households (name)
  values ('Finanças de ' || v_name)
  returning id into v_household_id;

  insert into public.household_members (household_id, user_id, role)
  values (v_household_id, new.id, 'owner');

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Cria um novo household tendo o usuário logado como dono.
-- Uso: supabase.rpc('create_household', { p_name: 'Casa' })
-- -----------------------------------------------------------------------------
create or replace function public.create_household(p_name varchar)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id      uuid := auth.uid();
  v_household_id uuid;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  insert into public.households (name)
  values (p_name)
  returning id into v_household_id;

  insert into public.household_members (household_id, user_id, role)
  values (v_household_id, v_user_id, 'owner');

  return v_household_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Compartilha um household com outro usuário já cadastrado, pelo email.
-- Apenas o dono do household pode convidar.
-- Uso: supabase.rpc('invite_member', { p_household_id, p_email })
-- -----------------------------------------------------------------------------
create or replace function public.invite_member(
  p_household_id uuid,
  p_email        varchar,
  p_role         public.member_role default 'member'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invited_id uuid;
begin
  if not public.is_household_owner(p_household_id) then
    raise exception 'Apenas o dono do household pode convidar membros.';
  end if;

  select id into v_invited_id
  from auth.users
  where lower(email) = lower(trim(p_email));

  if v_invited_id is null then
    raise exception 'Nenhum usuário cadastrado com o email informado.';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (p_household_id, v_invited_id, p_role)
  on conflict (household_id, user_id) do nothing;
end;
$$;


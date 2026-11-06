-- =============================================================================
-- 07_functions.sql
-- Funções de negócio (chamadas via supabase.rpc) e rotina de novo cadastro.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Cadastro: ao criar um usuário no Supabase Auth, cria o perfil, um household
-- pessoal, torna o usuário dono (owner) desse household e cria categorias
-- iniciais (Salário, Mercado, Transporte e Lazer), para o primeiro lançamento
-- não depender de configurar nada.
--
-- O nome vem dos metadados do signUp:
--   supabase.auth.signUp({ email, password, options: { data: { name } } })
--
-- O trigger em auth.users fica declarado no fim desta função. Ele precisa estar
-- aqui: sem ele, o "supabase db schema declarative sync" gera um DROP TRIGGER.
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

  -- Cores e ícones seguem a paleta e os nomes de ícone do frontend
  insert into public.categories (household_id, name, type, color, icon)
  values
    (v_household_id, 'Salário',    'income',  '#2F7D5B', 'briefcase'),
    (v_household_id, 'Mercado',    'expense', '#E08A5B', 'shopping-basket'),
    (v_household_id, 'Transporte', 'expense', '#3E8DA8', 'bus'),
    (v_household_id, 'Lazer',      'expense', '#7A6FA8', 'popcorn');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

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



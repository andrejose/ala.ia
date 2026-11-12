-- Espaço pessoal criado no cadastro passa a se chamar "Pessoal" (em vez de
-- "Finanças de <nome>") e categorias podem ser arquivadas (is_active), como as
-- contas. Só acrescenta: espaços já existentes mantêm o nome que têm.

ALTER TABLE public.categories
  ADD COLUMN is_active boolean NOT NULL DEFAULT true;

SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
  values ('Pessoal')
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
$function$;

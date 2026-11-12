-- =============================================================================
-- Cadastro (trigger handle_new_user em auth.users)
-- Cada arquivo roda numa transação desfeita no fim: nada fica no banco.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('11111111-1111-1111-1111-111111111111', 'ana@teste.local', '{"name": "Ana Souza"}'),
  ('22222222-2222-2222-2222-222222222222', 'semnome@teste.local', '{}');

select is(
  (select name from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'Ana Souza',
  'o perfil usa o nome informado no cadastro'
);

select is(
  (select name from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  'semnome',
  'sem nome, o perfil usa o começo do e-mail'
);

select results_eq(
  $$ select h.name::text, hm.role::text
       from public.household_members hm
       join public.households h on h.id = hm.household_id
      where hm.user_id = '11111111-1111-1111-1111-111111111111' $$,
  $$ values ('Pessoal', 'owner') $$,
  'cria um único espaço "Pessoal", com o usuário como dono'
);

select is(
  (select count(*)::int from public.household_members where user_id = '22222222-2222-2222-2222-222222222222'),
  1,
  'cada cadastro ganha o seu próprio espaço'
);

select isnt(
  (select household_id from public.household_members where user_id = '11111111-1111-1111-1111-111111111111'),
  (select household_id from public.household_members where user_id = '22222222-2222-2222-2222-222222222222'),
  'os espaços pessoais são diferentes'
);

select results_eq(
  $$ select c.name::text, c.type::text
       from public.categories c
       join public.household_members hm on hm.household_id = c.household_id
      where hm.user_id = '11111111-1111-1111-1111-111111111111'
      order by c.type, c.name $$,
  $$ values ('Salário', 'income'), ('Lazer', 'expense'), ('Mercado', 'expense'), ('Transporte', 'expense') $$,
  'cria as categorias padrão: Salário, Mercado, Transporte e Lazer'
);

select ok(
  (select bool_and(c.is_active and c.color is not null and c.icon is not null)
     from public.categories c
     join public.household_members hm on hm.household_id = c.household_id
    where hm.user_id = '11111111-1111-1111-1111-111111111111'),
  'as categorias padrão começam ativas, com cor e ícone'
);

select is(
  (select count(*)::int from public.accounts a
     join public.household_members hm on hm.household_id = a.household_id
    where hm.user_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'nenhuma conta é criada no cadastro'
);

-- Excluir o usuário leva junto o perfil e o vínculo (o espaço fica sem dono só
-- por cascata, o que o trigger de dono permite)
delete from auth.users where id = '22222222-2222-2222-2222-222222222222';
select is(
  (select count(*)::int from public.household_members where user_id = '22222222-2222-2222-2222-222222222222'),
  0,
  'excluir o usuário remove o perfil e o vínculo em cascata'
);

select * from finish();
rollback;

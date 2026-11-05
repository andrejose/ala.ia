-- Trigger em auth.users não é capturado pelo "supabase db diff" (schema auth é
-- gerenciado pelo Supabase). Ao cadastrar um usuário, cria perfil, household
-- pessoal e o vínculo de owner (ver public.handle_new_user em 07_functions.sql).
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

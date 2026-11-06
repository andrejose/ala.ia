SET local check_function_bodies = off;

DROP FUNCTION "public"."invite_member"(uuid, character varying, public.member_role);

CREATE OR REPLACE FUNCTION public.ensure_household_has_owner()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.invite_member (
  p_household_id uuid,
  p_email        character varying,
  p_role         public.member_role DEFAULT 'member'::public.member_role
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_invited_id uuid;
begin
  if not public.is_household_owner(p_household_id) then
    raise exception 'Apenas o dono do household pode convidar membros.'
      using errcode = '42501';
  end if;

  select id into v_invited_id
  from auth.users
  where lower(email) = lower(trim(p_email));

  if v_invited_id is null then
    raise exception 'Nenhum usuário cadastrado com o email informado.'
      using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.household_members
    where household_id = p_household_id and user_id = v_invited_id
  ) then
    raise exception 'Este usuário já é membro do household.'
      using errcode = '23505';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (p_household_id, v_invited_id, p_role);

  return v_invited_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.report_by_category (
  p_household_id uuid,
  p_month        date,
  p_type         public.transaction_type DEFAULT 'expense'::public.transaction_type
)
  RETURNS TABLE (
    category_id       uuid,
    name              character varying,
    color             character varying,
    icon              character varying,
    total             numeric,
    paid              numeric,
    pending           numeric,
    transaction_count bigint
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select
    c.id,
    c.name,
    c.color,
    c.icon,
    sum(t.amount),
    coalesce(sum(t.amount) filter (where t.payment_date is not null), 0),
    coalesce(sum(t.amount) filter (where t.payment_date is null),     0),
    count(*)
  from public.transactions t
  join public.categories c on c.id = t.category_id
  where t.household_id = p_household_id
    and t.type = p_type
    and t.due_date >= date_trunc('month', p_month)::date
    and t.due_date <  (date_trunc('month', p_month) + interval '1 month')::date
  group by c.id, c.name, c.color, c.icon
  order by sum(t.amount) desc, c.name;
$function$;

CREATE OR REPLACE FUNCTION public.report_monthly_summary (
  p_household_id uuid,
  p_month        date
)
  RETURNS TABLE (
    income_paid     numeric,
    income_pending  numeric,
    expense_paid    numeric,
    expense_pending numeric
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select
    coalesce(sum(amount) filter (where type = 'income'  and payment_date is not null), 0),
    coalesce(sum(amount) filter (where type = 'income'  and payment_date is null),     0),
    coalesce(sum(amount) filter (where type = 'expense' and payment_date is not null), 0),
    coalesce(sum(amount) filter (where type = 'expense' and payment_date is null),     0)
  from public.transactions
  where household_id = p_household_id
    and due_date >= date_trunc('month', p_month)::date
    and due_date <  (date_trunc('month', p_month) + interval '1 month')::date;
$function$;

CREATE TRIGGER household_members_ensure_owner
  BEFORE DELETE OR UPDATE ON public.household_members
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_household_has_owner();

GRANT EXECUTE ON FUNCTION "public"."ensure_household_has_owner"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."ensure_household_has_owner"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."ensure_household_has_owner"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."ensure_household_has_owner"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."invite_member"(uuid, character varying, public.member_role) TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."invite_member"(uuid, character varying, public.member_role) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."invite_member"(uuid, character varying, public.member_role) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."invite_member"(uuid, character varying, public.member_role) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."report_by_category"(uuid, date, public.transaction_type) TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."report_by_category"(uuid, date, public.transaction_type) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."report_by_category"(uuid, date, public.transaction_type) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."report_by_category"(uuid, date, public.transaction_type) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."report_monthly_summary"(uuid, date) TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."report_monthly_summary"(uuid, date) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."report_monthly_summary"(uuid, date) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."report_monthly_summary"(uuid, date) TO "service_role";

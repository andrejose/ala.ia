SET local check_function_bodies = off;

CREATE TABLE "public"."household_invitations" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "household_id" uuid                     NOT NULL,
  "email"        character varying(255)   NOT NULL,
  "role"         public.member_role       NOT NULL DEFAULT 'member'::public.member_role,
  "invited_by"   uuid,
  "status"       character varying(10)    NOT NULL DEFAULT 'pending'::character varying,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at"   timestamp with time zone NOT NULL DEFAULT (now() + '7 days'::interval),
  "responded_at" timestamp with time zone,
  CONSTRAINT "household_invitations_email_chk" CHECK (((email)::text = lower(TRIM(BOTH FROM email)))),
  CONSTRAINT "household_invitations_pkey" PRIMARY KEY (id),
  CONSTRAINT "household_invitations_status_chk"
    CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'accepted'::character varying, 'declined'::character varying, 'canceled'::character varying])::text[])))
);

ALTER TABLE "public"."household_invitations"
  ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.accept_invitation (
  p_invitation_id uuid
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.cancel_invitation (
  p_invitation_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.create_household (
  p_name character varying
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.current_user_email()
  RETURNS character varying
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select lower(email) from auth.users where id = (select auth.uid());
$function$;

CREATE OR REPLACE FUNCTION public.decline_invitation (
  p_invitation_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_invitation public.household_invitations := public.lock_my_invitation(p_invitation_id);
begin
  update public.household_invitations
     set status = 'declined', responded_at = now()
   where id = v_invitation.id;
end;
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.is_household_member (
  p_household_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select exists (
    select 1
    from public.household_members
    where household_id = p_household_id
      and user_id = (select auth.uid())
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_household_owner (
  p_household_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select exists (
    select 1
    from public.household_members
    where household_id = p_household_id
      and user_id = (select auth.uid())
      and role = 'owner'
  );
$function$;

CREATE OR REPLACE FUNCTION public.lock_my_invitation (
  p_invitation_id uuid
)
  RETURNS public.household_invitations
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.my_invitations()
  RETURNS TABLE (
    id             uuid,
    household_id   uuid,
    household_name character varying,
    role           public.member_role,
    invited_by     character varying,
    created_at     timestamp with time zone,
    expires_at     timestamp with time zone
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select i.id, i.household_id, h.name, i.role, p.name, i.created_at, i.expires_at
  from public.household_invitations i
  join public.households h on h.id = i.household_id
  left join public.profiles p on p.id = i.invited_by
  where i.email = public.current_user_email()
    and i.status = 'pending'
    and i.expires_at > now()
  order by i.created_at desc;
$function$;

ALTER TABLE "public"."household_invitations"
  ADD CONSTRAINT "household_invitations_household_id_fkey" FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;

ALTER TABLE "public"."household_invitations"
  ADD CONSTRAINT "household_invitations_invited_by_fkey" FOREIGN KEY (invited_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX household_invitations_email_idx ON public.household_invitations USING btree (email);

CREATE UNIQUE INDEX household_invitations_pending_key ON public.household_invitations USING btree (household_id, email)
  WHERE ((status)::text = 'pending'::text);

CREATE POLICY "Membros e convidados veem os convites" ON "public"."household_invitations"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT public.is_household_member(household_invitations.household_id) AS is_household_member) OR ((email)::text = lower(( SELECT (auth.jwt() ->> 'email'::text))))));

GRANT EXECUTE ON FUNCTION "public"."accept_invitation"(uuid) TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."accept_invitation"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."accept_invitation"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."accept_invitation"(uuid) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."cancel_invitation"(uuid) TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."cancel_invitation"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."cancel_invitation"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."cancel_invitation"(uuid) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."current_user_email"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."current_user_email"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."current_user_email"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."current_user_email"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."decline_invitation"(uuid) TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."decline_invitation"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."decline_invitation"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."decline_invitation"(uuid) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."lock_my_invitation"(uuid) TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."lock_my_invitation"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."lock_my_invitation"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."lock_my_invitation"(uuid) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."my_invitations"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."my_invitations"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."my_invitations"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."my_invitations"() TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."household_invitations" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."household_invitations" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."household_invitations" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."household_invitations" TO "service_role";

SET local check_function_bodies = off;

CREATE TABLE "public"."accounts" (
  "id"           uuid                   NOT NULL DEFAULT gen_random_uuid(),
  "household_id" uuid                   NOT NULL,
  "name"         character varying(100) NOT NULL,
  CONSTRAINT "accounts_id_household_id_key" UNIQUE (id, household_id),
  CONSTRAINT "accounts_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."accounts"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."categories" (
  "id"           uuid                  NOT NULL DEFAULT gen_random_uuid(),
  "household_id" uuid                  NOT NULL,
  "name"         character varying(50) NOT NULL,
  CONSTRAINT "categories_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."categories"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."household_members" (
  "household_id" uuid NOT NULL,
  "user_id"      uuid NOT NULL,
  CONSTRAINT "household_members_pkey" PRIMARY KEY (household_id, user_id)
);

ALTER TABLE "public"."household_members"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."households" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "name"       character varying(100)   NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "households_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."households"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."profiles" (
  "id"         uuid                     NOT NULL,
  "name"       character varying(100)   NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "profiles_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."profiles"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."transactions" (
  "id"                     uuid NOT NULL DEFAULT gen_random_uuid(),
  "household_id"           uuid NOT NULL,
  "account_id"             uuid NOT NULL,
  "destination_account_id" uuid,
  "category_id"            uuid,
  CONSTRAINT "transactions_pkey" PRIMARY KEY (id),
  "user_id"                uuid DEFAULT auth.uid()
);

ALTER TABLE "public"."transactions"
  ENABLE ROW LEVEL SECURITY;

CREATE TYPE "public"."account_type" AS ENUM (
  'checking',
  'savings',
  'investment',
  'cash'
);

ALTER TABLE "public"."accounts"
  ADD COLUMN "type" public.account_type NOT NULL DEFAULT 'checking'::public.account_type;

ALTER TABLE "public"."accounts"
  ADD COLUMN "initial_balance" numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE "public"."accounts"
  ADD COLUMN "is_active" boolean NOT NULL DEFAULT true;

ALTER TABLE "public"."accounts"
  ADD COLUMN "created_at" timestamp WITH time zone NOT NULL DEFAULT now();

ALTER TABLE "public"."accounts"
  ADD COLUMN "updated_at" timestamp WITH time zone NOT NULL DEFAULT now();

CREATE TYPE "public"."member_role" AS ENUM (
  'owner',
  'member'
);

ALTER TABLE "public"."household_members"
  ADD COLUMN "role" public.member_role NOT NULL DEFAULT 'member'::public.member_role;

ALTER TABLE "public"."household_members"
  ADD COLUMN "created_at" timestamp WITH time zone NOT NULL DEFAULT now();

CREATE TYPE "public"."transaction_type" AS ENUM (
  'income',
  'expense',
  'transfer'
);

ALTER TABLE "public"."categories"
  ADD COLUMN "type" public.transaction_type NOT NULL;

ALTER TABLE "public"."categories"
  ADD COLUMN "color" character varying(7);

ALTER TABLE "public"."categories"
  ADD COLUMN "icon" character varying(50);

ALTER TABLE "public"."categories"
  ADD COLUMN "created_at" timestamp WITH time zone NOT NULL DEFAULT now();

ALTER TABLE "public"."categories"
  ADD COLUMN "updated_at" timestamp WITH time zone NOT NULL DEFAULT now();

ALTER TABLE "public"."transactions"
  ADD COLUMN "type" public.transaction_type NOT NULL;

ALTER TABLE "public"."transactions"
  ADD COLUMN "description" character varying(200) NOT NULL;

ALTER TABLE "public"."transactions"
  ADD COLUMN "amount" numeric(12,2) NOT NULL;

ALTER TABLE "public"."transactions"
  ADD COLUMN "due_date" date NOT NULL DEFAULT CURRENT_DATE;

ALTER TABLE "public"."transactions"
  ADD COLUMN "payment_date" date;

ALTER TABLE "public"."transactions"
  ADD COLUMN "created_at" timestamp WITH time zone NOT NULL DEFAULT now();

ALTER TABLE "public"."transactions"
  ADD COLUMN "updated_at" timestamp WITH time zone NOT NULL DEFAULT now();

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

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.invite_member (
  p_household_id uuid,
  p_email        character varying,
  p_role         public.member_role DEFAULT 'member'::public.member_role
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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

CREATE OR REPLACE FUNCTION public.set_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

ALTER TABLE "public"."categories"
  ADD CONSTRAINT "categories_color_chk" CHECK (((color IS NULL) OR ((color)::text ~ '^#[0-9A-Fa-f]{6}$'::text)));

ALTER TABLE "public"."categories"
  ADD CONSTRAINT "categories_id_household_id_type_key" UNIQUE (id, household_id, TYPE);

ALTER TABLE "public"."categories"
  ADD CONSTRAINT "categories_name_key" UNIQUE (household_id, TYPE, name);

ALTER TABLE "public"."categories"
  ADD CONSTRAINT "categories_type_chk" CHECK ((type = ANY (ARRAY['income'::public.transaction_type, 'expense'::public.transaction_type])));

ALTER TABLE "public"."accounts"
  ADD CONSTRAINT "accounts_household_id_fkey" FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;

ALTER TABLE "public"."categories"
  ADD CONSTRAINT "categories_household_id_fkey" FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;

ALTER TABLE "public"."household_members"
  ADD CONSTRAINT "household_members_household_id_fkey" FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;

ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."household_members"
  ADD CONSTRAINT "household_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "public"."transactions"
  ADD CONSTRAINT "transactions_account_fkey" FOREIGN KEY (account_id, household_id) REFERENCES public.accounts(id, household_id);

ALTER TABLE "public"."transactions"
  ADD CONSTRAINT "transactions_amount_chk" CHECK ((amount > (0)::numeric));

ALTER TABLE "public"."transactions"
  ADD CONSTRAINT "transactions_category_fkey" FOREIGN KEY (category_id, household_id, TYPE) REFERENCES public.categories(id, household_id, TYPE);

ALTER TABLE "public"."transactions"
  ADD CONSTRAINT "transactions_destination_account_fkey" FOREIGN KEY (destination_account_id, household_id) REFERENCES public.accounts(id, household_id);

ALTER TABLE "public"."transactions"
  ADD CONSTRAINT "transactions_household_id_fkey" FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;

ALTER TABLE "public"."transactions"
  ADD CONSTRAINT "transactions_type_chk" CHECK ((((type = 'transfer'::public.transaction_type) AND (destination_account_id IS
    NOT NULL) AND (destination_account_id <> account_id) AND (category_id IS NULL)) OR
    ((type <> 'transfer'::public.transaction_type) AND (destination_account_id IS NULL) AND (category_id IS NOT NULL))));

CREATE VIEW "public"."account_balances" WITH (security_invoker=true) AS  SELECT a.id AS account_id,
    a.household_id,
    a.name,
    a.type,
    a.is_active,
    a.initial_balance,
    (a.initial_balance + COALESCE(sum(
        CASE
            WHEN ((t.type = 'income'::public.transaction_type) AND (t.account_id = a.id)) THEN t.amount
            WHEN ((t.type = 'expense'::public.transaction_type) AND (t.account_id = a.id)) THEN (- t.amount)
            WHEN ((t.type = 'transfer'::public.transaction_type) AND (t.account_id = a.id)) THEN (- t.amount)
            WHEN ((t.type = 'transfer'::public.transaction_type) AND (t.destination_account_id = a.id)) THEN t.amount
            ELSE (0)::numeric
        END), (0)::numeric)) AS current_balance
   FROM (public.accounts a
     LEFT JOIN public.transactions t ON ((((t.account_id = a.id) OR (t.destination_account_id = a.id)) AND (t.payment_date IS NOT NULL))))
  GROUP BY a.id;

CREATE INDEX accounts_household_id_idx ON public.accounts USING btree (household_id);

CREATE INDEX household_members_user_id_idx ON public.household_members USING btree (user_id);

CREATE INDEX transactions_account_id_idx ON public.transactions USING btree (account_id);

CREATE INDEX transactions_category_id_idx ON public.transactions USING btree (category_id);

CREATE INDEX transactions_destination_account_id_idx ON public.transactions USING btree (destination_account_id);

CREATE INDEX transactions_household_due_date_idx ON public.transactions USING btree (household_id, due_date);

CREATE TRIGGER accounts_set_updated_at
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER categories_set_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER households_set_updated_at
  BEFORE UPDATE ON public.households
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER transactions_set_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Membros gerenciam as contas do household" ON "public"."accounts"
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.is_household_member(accounts.household_id) AS is_household_member))
  WITH CHECK (( SELECT public.is_household_member(accounts.household_id) AS is_household_member));

CREATE POLICY "Membros gerenciam as categorias do household" ON "public"."categories"
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.is_household_member(categories.household_id) AS is_household_member))
  WITH CHECK (( SELECT public.is_household_member(categories.household_id) AS is_household_member));

CREATE POLICY "Dono altera papel dos membros" ON "public"."household_members"
  FOR UPDATE
  TO "authenticated"
  USING (( SELECT public.is_household_owner(household_members.household_id) AS is_household_owner))
  WITH CHECK (( SELECT public.is_household_owner(household_members.household_id) AS is_household_owner));

CREATE POLICY "Dono remove membros ou o próprio usuário sai" ON "public"."household_members"
  FOR DELETE
  TO "authenticated"
  USING ((( SELECT public.is_household_owner(household_members.household_id) AS is_household_owner) OR (user_id = ( SELECT auth.uid() AS uid))));

CREATE POLICY "Membros veem os membros do household" ON "public"."household_members"
  FOR SELECT
  TO "authenticated"
  USING (( SELECT public.is_household_member(household_members.household_id) AS is_household_member));

CREATE POLICY "Dono edita o household" ON "public"."households"
  FOR UPDATE
  TO "authenticated"
  USING (( SELECT public.is_household_owner(households.id) AS is_household_owner))
  WITH CHECK (( SELECT public.is_household_owner(households.id) AS is_household_owner));

CREATE POLICY "Dono exclui o household" ON "public"."households"
  FOR DELETE
  TO "authenticated"
  USING (( SELECT public.is_household_owner(households.id) AS is_household_owner));

CREATE POLICY "Membros veem o household" ON "public"."households"
  FOR SELECT
  TO "authenticated"
  USING (( SELECT public.is_household_member(households.id) AS is_household_member));

CREATE POLICY "Editar próprio perfil" ON "public"."profiles"
  FOR UPDATE
  TO "authenticated"
  USING ((id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Ver próprio perfil e de membros dos meus households" ON "public"."profiles"
  FOR SELECT
  TO "authenticated"
  USING (((id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.household_members hm
  WHERE ((hm.user_id = profiles.id) AND ( SELECT public.is_household_member(hm.household_id) AS is_household_member))))));

CREATE POLICY "Membros gerenciam as transações do household" ON "public"."transactions"
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.is_household_member(transactions.household_id) AS is_household_member))
  WITH CHECK (( SELECT public.is_household_member(transactions.household_id) AS is_household_member));

GRANT EXECUTE ON FUNCTION "public"."create_household"(character varying) TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."create_household"(character varying) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."create_household"(character varying) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."create_household"(character varying) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."invite_member"(uuid, character varying, public.member_role) TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."invite_member"(uuid, character varying, public.member_role) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."invite_member"(uuid, character varying, public.member_role) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."invite_member"(uuid, character varying, public.member_role) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."is_household_member"(uuid) TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."is_household_member"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_household_member"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_household_member"(uuid) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."is_household_owner"(uuid) TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."is_household_owner"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_household_owner"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_household_owner"(uuid) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."set_updated_at"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."set_updated_at"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_updated_at"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_updated_at"() TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."accounts" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."accounts" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."accounts" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."accounts" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."categories" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."categories" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."categories" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."categories" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."household_members" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."household_members" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."household_members" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."household_members" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."households" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."households" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."households" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."households" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."profiles" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."transactions" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."transactions" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."transactions" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."transactions" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."account_balances" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."account_balances" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."account_balances" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."account_balances" TO "service_role";

ALTER TABLE "public"."transactions"
  ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX transactions_user_id_idx ON public.transactions USING btree (user_id);

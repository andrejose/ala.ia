SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.set_transaction_author()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if tg_op = 'INSERT' then
    if (select auth.uid()) is not null then
      new.user_id := (select auth.uid());
    end if;
  elsif new.user_id is not null and new.user_id is distinct from old.user_id then
    new.user_id := old.user_id;
  end if;
  return new;
end;
$function$;

CREATE TRIGGER transactions_set_author
  BEFORE INSERT OR UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_transaction_author();

GRANT EXECUTE ON FUNCTION "public"."set_transaction_author"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."set_transaction_author"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_transaction_author"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_transaction_author"() TO "service_role";

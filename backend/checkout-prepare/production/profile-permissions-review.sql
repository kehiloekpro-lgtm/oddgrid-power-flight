-- REVIEW PROPOSAL ONLY: not an approved Production deployment or CLI migration.
-- Future operator MUST independently validate the Production project connection,
-- reviewed Git/checksum, backup/recovery readiness and obtain explicit approval.
-- Unlike the Development migration, this preserves existing profile records.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
LOCK TABLE public.profiles IN SHARE ROW EXCLUSIVE MODE;
DO $review$
DECLARE before_rows text;
BEGIN
  IF NOT has_table_privilege('authenticated','public.profiles','UPDATE')
     OR NOT has_table_privilege('anon','public.profiles','UPDATE')
     OR has_table_privilege('public','public.profiles','UPDATE')
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.profiles'::regclass)
     OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='Users update own profile' AND cmd='UPDATE')
  THEN RAISE EXCEPTION 'Unreviewed profile privilege/RLS state'; END IF;
  SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY id)::text,'[]')) INTO before_rows FROM public.profiles p;
  REVOKE UPDATE ON TABLE public.profiles FROM anon,authenticated;
  GRANT UPDATE(first_name,last_name,phone) ON public.profiles TO authenticated;
  IF EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid='public.profiles'::regclass AND a.attnum>0 AND NOT a.attisdropped
    AND (has_column_privilege('anon','public.profiles',a.attname,'UPDATE')
      OR has_column_privilege('authenticated','public.profiles',a.attname,'UPDATE') IS DISTINCT FROM (a.attname IN ('first_name','last_name','phone'))))
    OR NOT has_column_privilege('service_role','public.profiles','role','UPDATE')
    OR NOT has_column_privilege('postgres','public.profiles','role','UPDATE')
  THEN RAISE EXCEPTION 'Unexpected effective profile privileges'; END IF;
  IF (SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY id)::text,'[]')) FROM public.profiles p) IS DISTINCT FROM before_rows
  THEN RAISE EXCEPTION 'Profile data changed'; END IF;
END;
$review$;
COMMIT;
-- Recovery: a SQL failure rolls back. An ambiguous connection outcome requires
-- read-only privilege/data verification, never automatic replay. Do not restore
-- broad customer UPDATE as a rollback; prepare a reviewed forward correction.

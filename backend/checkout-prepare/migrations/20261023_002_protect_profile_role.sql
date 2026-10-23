-- OddGrid Development security correction, 2026-10-23.
-- Reviewed independently of the 20261021 secure checkout migration.
-- Purpose: ordinary customers must never be able to assign their own
-- public.profiles.role or change immutable/system-owned profile fields.
-- A trusted postgres/service_role backend remains responsible for role changes.
-- Execute on OddGrid Development only after verifying target and empty profiles.
-- No data changes, no RLS policy changes, and no checkout-function changes.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '20s';

DO $preflight$
BEGIN
  IF (SELECT count(*) FROM public.profiles) <> 0 THEN
    RAISE EXCEPTION 'Refuse role-permission correction with profile records: review first';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.profiles', 'UPDATE')
     OR NOT has_table_privilege('anon', 'public.profiles', 'UPDATE')
     OR has_table_privilege('public', 'public.profiles', 'UPDATE') THEN
    RAISE EXCEPTION 'Unexpected pre-migration profile UPDATE grants';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='profiles'
      AND policyname='Users update own profile' AND cmd='UPDATE'
  ) THEN
    RAISE EXCEPTION 'Expected own-profile RLS policy absent';
  END IF;
END;
$preflight$;

-- REVOKE column-level UPDATE alone is ineffective while table-wide UPDATE exists.
REVOKE UPDATE ON TABLE public.profiles FROM anon, authenticated;

-- Customers may still edit only their own personal contact/name fields,
-- because their existing SELECT and UPDATE RLS policies remain in effect.
GRANT UPDATE (first_name, last_name, phone)
  ON TABLE public.profiles TO authenticated;

DO $postcondition$
BEGIN
  IF has_table_privilege('anon','public.profiles','UPDATE')
     OR has_table_privilege('authenticated','public.profiles','UPDATE')
     OR has_column_privilege('anon','public.profiles','role','UPDATE')
     OR has_column_privilege('authenticated','public.profiles','role','UPDATE')
     OR has_column_privilege('authenticated','public.profiles','id','UPDATE')
     OR has_column_privilege('authenticated','public.profiles','created_at','UPDATE')
     OR has_column_privilege('authenticated','public.profiles','updated_at','UPDATE')
     OR NOT has_column_privilege('authenticated','public.profiles','first_name','UPDATE')
     OR NOT has_column_privilege('authenticated','public.profiles','last_name','UPDATE')
     OR NOT has_column_privilege('authenticated','public.profiles','phone','UPDATE')
     OR NOT has_column_privilege('postgres','public.profiles','role','UPDATE')
     OR NOT has_column_privilege('service_role','public.profiles','role','UPDATE')
  THEN
    RAISE EXCEPTION 'Profile role-protection migration did not reach expected grants';
  END IF;
END;
$postcondition$;

-- Required follow-up: update Phase 5 real_staff.sql, which currently EXPECTS
-- self-promotion to work; test denied UPDATE(role), allowed customer-name edits,
-- service-only staff provisioning and non-staff RLS denial. Do not rerun Phase 5
-- until its deadlocked hosted isolationtester coordination has been investigated.

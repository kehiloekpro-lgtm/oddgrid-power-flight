-- Real restored helper, transaction-local synthetic identities. No helper replacement.
INSERT INTO auth.users(id) VALUES ('71000000-0000-4000-8000-000000000001');
SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',true);
SELECT pg_temp.assert_true(NOT private.is_staff_or_admin(),'default customer is not staff');
SELECT pg_temp.reject($q$SELECT pg_temp.prepare('30000000-0000-4000-8000-000000000004',NULL,'51000000-0000-4000-8000-000000000001')$q$,'42501');
UPDATE public.profiles SET role='staff' WHERE id='71000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(private.is_staff_or_admin(),'actual staff profile recognized');
SELECT pg_temp.assert_true(NOT public.is_oddgrid_admin(),'staff role is separate from admin_users');
SELECT pg_temp.assert_true(pg_temp.prepare('30000000-0000-4000-8000-000000000004',NULL,'51000000-0000-4000-8000-000000000001') IS NOT NULL,'staff can prepare owner cart through privileged bridge');
UPDATE public.profiles SET role='admin' WHERE id='71000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(private.is_staff_or_admin(),'actual admin profile recognized');
SELECT pg_temp.assert_true(pg_temp.prepare('30000000-0000-4000-8000-000000000004',NULL,'51000000-0000-4000-8000-000000000002') IS NOT NULL,'admin exception preserved');
UPDATE public.profiles SET role='customer' WHERE id='71000000-0000-4000-8000-000000000001';
SELECT pg_temp.reject($q$SELECT pg_temp.prepare('30000000-0000-4000-8000-000000000004',NULL,'51000000-0000-4000-8000-000000000003')$q$,'42501');
SELECT set_config('request.jwt.claim.sub','',true);

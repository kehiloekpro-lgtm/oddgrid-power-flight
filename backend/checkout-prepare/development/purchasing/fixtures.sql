-- REVIEW ONLY. Separate Development-only fixture approval required.
-- Operator must validate exact project and reviewed post-history catalogue first.
-- No Auth users, payment attempts, orders or customer profiles created.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
LOCK TABLE public.products,public.product_variants IN SHARE ROW EXCLUSIVE MODE;
DO $fixtures$ BEGIN
 IF EXISTS(SELECT 1 FROM public.products) OR EXISTS(SELECT 1 FROM public.product_variants)
 OR EXISTS(SELECT 1 FROM public.carts) OR EXISTS(SELECT 1 FROM public.checkout_sessions)
 OR EXISTS(SELECT 1 FROM auth.users) THEN RAISE EXCEPTION 'Expected empty Development fixture state'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='product_variants' AND policyname='Public read eligible direct-sale variants')
 THEN RAISE EXCEPTION 'Reviewed variant visibility policy required'; END IF;
END; $fixtures$;
INSERT INTO public.products(id,name,slug,sku,currency,selling_price,sale_type,status,availability,description)
VALUES ('10000000-0000-4000-8000-000000000081','DEVELOPMENT TEST — Power station','development-test-power-station','DEV-PARENT','ZAR',100,'direct','active','confirmed_available','Synthetic Development fixture. Not supplier inventory. No real orders or payments.');
INSERT INTO public.product_variants(id,product_id,variant_name,sku,currency,selling_price,availability,is_active)
VALUES ('20000000-0000-4000-8000-000000000081','10000000-0000-4000-8000-000000000081','Test extended configuration','DEV-EXTENDED','ZAR',325.50,'confirmed_available',true),
('20000000-0000-4000-8000-000000000082','10000000-0000-4000-8000-000000000081','Test standard configuration','DEV-STANDARD','ZAR',225,'confirmed_available',true);
COMMIT;
-- No automatic cleanup: retain created cart/checkout IDs privately during approved browser tests.
-- Cleanup needs separately reviewed scoped SQL; never reset tables or delete evidence.

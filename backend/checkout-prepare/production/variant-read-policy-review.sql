-- REVIEW PROPOSAL ONLY. Explicit project/backup/review approval required before use.
-- Both inspected projects currently have RLS and SELECT grants, but no variant policies.
-- Exposes eligible SELLING information only; no writes, costs or stock claims.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $review$
BEGIN
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.product_variants'::regclass)
 OR NOT has_table_privilege('anon','public.product_variants','SELECT')
 OR NOT has_table_privilege('authenticated','public.product_variants','SELECT')
 OR EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='product_variants')
 THEN RAISE EXCEPTION 'Unreviewed variant RLS/grant state'; END IF;
END;
$review$;
CREATE POLICY "Public read eligible direct-sale variants" ON public.product_variants
FOR SELECT TO anon,authenticated USING (
 is_active AND availability='confirmed_available'
 AND selling_price>0 AND selling_price::text NOT IN ('NaN','Infinity','-Infinity')
 AND EXISTS(SELECT 1 FROM public.products p WHERE p.id=product_variants.product_id
   AND p.status='active' AND p.sale_type='direct' AND p.availability='confirmed_available'
   AND p.currency=product_variants.currency)
);
COMMIT;
-- No anonymous UPDATE/INSERT/DELETE grant is added. RFQ configurations remain a
-- separate contract decision. Do not relax this predicate to fill an empty grid.
-- SQL failure rolls back; ambiguous outcome requires read-only policy inspection.

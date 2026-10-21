-- Run ONLY after export-fixture.sql, before-migration.sql, and the migration in an isolated database.
-- No payment attempts, public orders, or finalization calls. All test writes roll back.
BEGIN;
CREATE FUNCTION pg_temp.assert_true(value boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.reject(sql text, expected_state text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE sql;
 EXCEPTION WHEN OTHERS THEN
   IF SQLSTATE=expected_state THEN RETURN; END IF;
   RAISE EXCEPTION 'Wrong SQLSTATE: % (expected %): %', SQLSTATE,expected_state,SQLERRM;
 END;
 RAISE EXCEPTION 'Expected rejection: %',sql;
END $$;
CREATE FUNCTION pg_temp.prepare(cart uuid, token uuid, key uuid) RETURNS uuid LANGUAGE sql AS $$
 SELECT public.checkout_prepare_bridge(cart,'fixture@example.test',NULL,'Fixture',NULL,
  'Fixture address',NULL,'Fixture city',NULL,NULL,'US'::character(2),key,token);
$$;

SELECT pg_temp.assert_true((SELECT variant_id IS NULL AND variant_name IS NULL AND unit_price=12.50 AND line_total=25
 FROM public.checkout_items WHERE checkout_session_id='90000000-0000-4000-8000-000000000002'), 'historical snapshot preserved');
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM pg_attribute WHERE attrelid IN ('public.checkout_items'::regclass,'public.order_items'::regclass) AND attname='line_total' AND attgenerated='s'), 'generated columns preserved');

INSERT INTO public.products (id,name,slug,sku,currency,selling_price,sale_type,status,availability) VALUES
 ('10000000-0000-4000-8000-000000000001','Base fixture','base-fixture','BASE','USD',100,'direct','active','confirmed_available'),
 ('10000000-0000-4000-8000-000000000002','Configured fixture','configured-fixture','PARENT','USD',200,'direct','active','confirmed_available');
INSERT INTO public.product_variants (id,product_id,variant_name,sku,currency,selling_price,availability,is_active) VALUES
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','Higher','HIGH','USD',300,'confirmed_available',true),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Lower','LOW','USD',150,'confirmed_available',true);
INSERT INTO public.carts (id,guest_token,currency) VALUES
 ('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','USD'),
 ('30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','USD'),
 ('30000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000003','USD');
INSERT INTO public.cart_items (cart_id,product_id,variant_id,quantity) VALUES
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',NULL,2),
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',NULL,1),
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001',2),
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002',1),
 ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',NULL,1);

-- Valid standard and selected variants (base + two variants of the same parent coexist).
CREATE TEMP TABLE result AS SELECT pg_temp.prepare('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001') AS id;
SELECT pg_temp.assert_true((SELECT count(*)=4 AND sum(line_total)=1150 FROM public.checkout_items WHERE checkout_session_id=(SELECT id FROM result)), 'four accurately priced lines');
SELECT pg_temp.assert_true((SELECT subtotal=1150 AND total_amount=1150 AND shipping_amount=0 AND tax_amount=0 AND discount_amount=0 AND expires_at > clock_timestamp()+interval '29 minutes' AND expires_at <= clock_timestamp()+interval '31 minutes' FROM public.checkout_sessions WHERE id=(SELECT id FROM result)), 'server totals, zero charge policy, checkout expiry');
SELECT pg_temp.assert_true((SELECT variant_name='Higher' AND product_sku='HIGH' AND unit_price=300 AND quantity=2 FROM public.checkout_items WHERE checkout_session_id=(SELECT id FROM result) AND variant_id='20000000-0000-4000-8000-000000000001'), 'variant-specific snapshot');
SELECT pg_temp.assert_true(pg_temp.prepare('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001')=(SELECT id FROM result), 'idempotent retry');

-- Cross-guest proof and cross-cart key reuse never disclose a checkout.
SELECT pg_temp.reject($q$SELECT pg_temp.prepare('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002')$q$,'42501');
SELECT pg_temp.reject($q$SELECT pg_temp.prepare('30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000001')$q$,'22023');
SELECT pg_temp.reject($q$SELECT pg_temp.prepare('30000000-0000-4000-8000-000000000001',NULL,'50000000-0000-4000-8000-000000000002')$q$,'42501');
SELECT pg_temp.reject($q$SELECT public.checkout_prepare_bridge('30000000-0000-4000-8000-000000000001','fixture@example.test',NULL,'Fixture',NULL,'Fixture address',NULL,'Fixture city',NULL,NULL,'US','50000000-0000-4000-8000-000000000002')$q$,'42501');
SELECT pg_temp.reject($q$SELECT private.create_checkout_from_cart('30000000-0000-4000-8000-000000000001','fixture@example.test',NULL,'Fixture',NULL,'Fixture address',NULL,'Fixture city',NULL,NULL,'US','50000000-0000-4000-8000-000000000002')$q$,'42501');
SELECT pg_temp.reject($q$SELECT pg_temp.prepare('30000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000002')$q$,'22023');

-- Service role can use the new bridge, ordinary browser roles cannot invoke privileged RPCs.
SET LOCAL ROLE service_role;
SELECT public.checkout_prepare_bridge('30000000-0000-4000-8000-000000000001','fixture@example.test',NULL,'Fixture',NULL,'Fixture address',NULL,'Fixture city',NULL,NULL,'US','50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001');
RESET ROLE;
-- Snapshot uniqueness permits variants but never duplicates a base or selected variant.
SELECT pg_temp.reject($q$INSERT INTO public.checkout_items(checkout_session_id,product_id,product_name,quantity,unit_price) SELECT id,'10000000-0000-4000-8000-000000000002','duplicate',1,200 FROM result$q$,'23505');
SELECT pg_temp.reject($q$INSERT INTO public.checkout_items(checkout_session_id,product_id,variant_id,variant_name,product_name,quantity,unit_price) SELECT id,'10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','Higher','duplicate',1,300 FROM result$q$,'23505');

-- Variant/product mismatch is additionally enforced by the existing composite cart FK.
SELECT pg_temp.reject($q$INSERT INTO public.cart_items(cart_id,product_id,variant_id,quantity) VALUES ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',1)$q$,'23503');
-- Defense in depth: even a legacy/broken FK state cannot bypass the function's variant checks.
-- This constraint change is isolated, savepoint-contained fixture setup, never a production instruction.
SAVEPOINT invalid_variant_fixture;
ALTER TABLE public.cart_items DROP CONSTRAINT cart_items_variant_product_fk;
INSERT INTO public.cart_items(cart_id,product_id,variant_id,quantity) VALUES
 ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',1);
SELECT pg_temp.reject($q$SELECT pg_temp.prepare('30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002')$q$,'22023');
UPDATE public.cart_items SET variant_id='20000000-0000-4000-8000-000000000099' WHERE cart_id='30000000-0000-4000-8000-000000000002' AND variant_id IS NOT NULL;
SELECT pg_temp.reject($q$SELECT pg_temp.prepare('30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002')$q$,'22023');
ROLLBACK TO SAVEPOINT invalid_variant_fixture;
RELEASE SAVEPOINT invalid_variant_fixture;
UPDATE public.product_variants SET is_active=false WHERE id='20000000-0000-4000-8000-000000000001';
SELECT pg_temp.reject($q$SELECT pg_temp.prepare('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002')$q$,'22023');
UPDATE public.product_variants SET is_active=true, selling_price=NULL WHERE id='20000000-0000-4000-8000-000000000001';
SELECT pg_temp.reject($q$SELECT pg_temp.prepare('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002')$q$,'22023');
UPDATE public.product_variants SET selling_price=300,currency='ZAR' WHERE id='20000000-0000-4000-8000-000000000001';
SELECT pg_temp.reject($q$SELECT pg_temp.prepare('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002')$q$,'22023');
UPDATE public.product_variants SET currency='USD',availability='available_to_order' WHERE id='20000000-0000-4000-8000-000000000001';
SELECT pg_temp.reject($q$SELECT pg_temp.prepare('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002')$q$,'22023');
UPDATE public.product_variants SET availability='confirmed_available' WHERE id='20000000-0000-4000-8000-000000000001';
UPDATE public.cart_items SET quantity=101 WHERE cart_id='30000000-0000-4000-8000-000000000002';
SELECT pg_temp.reject($q$SELECT pg_temp.prepare('30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002')$q$,'22023');
UPDATE public.cart_items SET quantity=1 WHERE cart_id='30000000-0000-4000-8000-000000000002';
UPDATE public.products SET availability='available_to_order' WHERE id='10000000-0000-4000-8000-000000000001';
SELECT pg_temp.reject($q$SELECT pg_temp.prepare('30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002')$q$,'22023');
UPDATE public.products SET availability='confirmed_available',currency='ZAR' WHERE id='10000000-0000-4000-8000-000000000001';
SELECT pg_temp.reject($q$SELECT pg_temp.prepare('30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002')$q$,'22023');
UPDATE public.products SET currency='USD' WHERE id='10000000-0000-4000-8000-000000000001';

-- Additional catalogue eligibility: draft, RFQ and NaN prices cannot produce snapshots.
UPDATE public.products SET status='draft' WHERE id='10000000-0000-4000-8000-000000000001';
SELECT pg_temp.reject($q$SELECT pg_temp.prepare('30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002')$q$,'22023');
UPDATE public.products SET status='active',sale_type='rfq' WHERE id='10000000-0000-4000-8000-000000000001';
SELECT pg_temp.reject($q$SELECT pg_temp.prepare('30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002')$q$,'22023');
UPDATE public.products SET sale_type='direct' WHERE id='10000000-0000-4000-8000-000000000001';
UPDATE public.product_variants SET selling_price='NaN'::numeric WHERE id='20000000-0000-4000-8000-000000000001';
SELECT pg_temp.reject($q$SELECT pg_temp.prepare('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002')$q$,'22023');
UPDATE public.product_variants SET selling_price=300 WHERE id='20000000-0000-4000-8000-000000000001';

-- Authenticated ownership is preserved by the legacy signatures, but NULL auth cannot bypass it.
INSERT INTO auth.users(id) VALUES ('70000000-0000-4000-8000-000000000001');
INSERT INTO public.carts(id,user_id,currency) VALUES ('30000000-0000-4000-8000-000000000004','70000000-0000-4000-8000-000000000001','USD');
INSERT INTO public.cart_items(cart_id,product_id,quantity) VALUES ('30000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001',1);
SELECT pg_temp.reject($q$SELECT pg_temp.prepare('30000000-0000-4000-8000-000000000004',NULL,'50000000-0000-4000-8000-000000000004')$q$,'42501');
SELECT set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000002',true);
SELECT pg_temp.reject($q$SELECT pg_temp.prepare('30000000-0000-4000-8000-000000000004',NULL,'50000000-0000-4000-8000-000000000004')$q$,'42501');
SELECT set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);
SELECT pg_temp.assert_true(public.checkout_prepare_bridge('30000000-0000-4000-8000-000000000004','fixture@example.test',NULL,'Fixture',NULL,'Fixture address',NULL,'Fixture city',NULL,NULL,'US','50000000-0000-4000-8000-000000000004') IS NOT NULL,'authenticated owner legacy path');
SELECT set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000002',true);
SELECT set_config('oddgrid.test_staff','yes',true);
SELECT pg_temp.assert_true(pg_temp.prepare('30000000-0000-4000-8000-000000000004',NULL,'50000000-0000-4000-8000-000000000005') IS NOT NULL,'existing staff exception preserved');
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('oddgrid.test_staff','no',true);

-- Changed-cart key reuse rejected; a catalogue price change does not rewrite an existing snapshot.
UPDATE public.cart_items SET quantity=3 WHERE cart_id='30000000-0000-4000-8000-000000000001' AND product_id='10000000-0000-4000-8000-000000000001';
SELECT pg_temp.reject($q$SELECT pg_temp.prepare('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001')$q$,'22023');
UPDATE public.cart_items SET quantity=2 WHERE cart_id='30000000-0000-4000-8000-000000000001' AND product_id='10000000-0000-4000-8000-000000000001';
UPDATE public.products SET selling_price=101 WHERE id='10000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(pg_temp.prepare('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001')=(SELECT id FROM result),'replay keeps frozen price');
SELECT pg_temp.assert_true((SELECT total_amount=1150 FROM public.checkout_sessions WHERE id=(SELECT id FROM result)), 'original price is frozen');

-- An old USD session cannot be replayed after a cart/catalogue currency switch.
SAVEPOINT currency_replay_fixture;
UPDATE public.carts SET currency='ZAR' WHERE id='30000000-0000-4000-8000-000000000001';
UPDATE public.products SET currency='ZAR' WHERE id IN ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002');
UPDATE public.product_variants SET currency='ZAR' WHERE product_id='10000000-0000-4000-8000-000000000002';
SELECT pg_temp.reject($q$SELECT pg_temp.prepare('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001')$q$,'22023');
ROLLBACK TO SAVEPOINT currency_replay_fixture;
RELEASE SAVEPOINT currency_replay_fixture;

-- Check the exact finalization projection without invoking it or inserting a public order.
CREATE TEMP TABLE isolated_order_snapshots (LIKE public.order_items INCLUDING GENERATED INCLUDING CONSTRAINTS INCLUDING DEFAULTS);
INSERT INTO isolated_order_snapshots (order_id,product_id,variant_id,variant_name,product_name,product_sku,product_model,brand_name,unit_price,quantity)
SELECT '60000000-0000-4000-8000-000000000001',ci.product_id,ci.variant_id,ci.variant_name,ci.product_name,ci.product_sku,ci.product_model,ci.brand_name,ci.unit_price,ci.quantity
FROM public.checkout_items ci WHERE checkout_session_id=(SELECT id FROM result);
SELECT pg_temp.assert_true((SELECT count(*)=4 AND sum(line_total)=1150 FROM isolated_order_snapshots),'order projection preserves amounts');
SELECT pg_temp.assert_true((SELECT variant_name='Higher' AND product_sku='HIGH' AND unit_price=300 AND quantity=2 FROM isolated_order_snapshots WHERE variant_id='20000000-0000-4000-8000-000000000001'),'order projection preserves configuration');

UPDATE public.checkout_sessions SET subtotal=subtotal+1 WHERE id=(SELECT id FROM result);
SELECT pg_temp.reject($q$SELECT pg_temp.prepare('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001')$q$,'22023');
UPDATE public.checkout_sessions SET subtotal=1150,expires_at=clock_timestamp()-interval '1 second' WHERE id=(SELECT id FROM result);
SELECT pg_temp.reject($q$SELECT pg_temp.prepare('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001')$q$,'22023');
UPDATE public.carts SET status='converted' WHERE id='30000000-0000-4000-8000-000000000002';
SELECT pg_temp.reject($q$SELECT pg_temp.prepare('30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002')$q$,'22023');
SELECT pg_temp.assert_true(NOT has_function_privilege('anon','public.checkout_prepare_bridge(uuid,text,text,text,text,text,text,text,text,text,character,uuid,uuid)','EXECUTE') AND NOT has_function_privilege('authenticated','private.create_checkout_from_cart(uuid,text,text,text,text,text,text,text,text,text,character,uuid,uuid)','EXECUTE'), 'RPC grants remain privileged');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.payments) AND (SELECT count(*)=0 FROM public.orders),'no payments or orders created');
ROLLBACK;

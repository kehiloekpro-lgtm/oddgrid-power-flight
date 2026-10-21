-- REVIEW SUPPORT ONLY: read-only metadata export. Do not execute against the live project
-- as part of this assignment. A database owner may run this later to supply definitions.
BEGIN TRANSACTION READ ONLY;

-- Full current definitions, exact overloads, security settings, owner and grants.
SELECT n.nspname AS schema_name, p.proname,
       pg_get_function_identity_arguments(p.oid) AS identity_arguments,
       pg_get_function_result(p.oid) AS result_type,
       p.prosecdef, p.proconfig, p.proacl, pg_get_userbyid(p.proowner) AS owner,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE (n.nspname = 'private' AND p.proname IN
       ('create_checkout_from_cart', 'finalize_order_from_payment'))
   OR (n.nspname = 'public' AND p.proname = 'checkout_prepare_bridge');

-- Column types, nullability, defaults and generated expressions (no customer rows).
SELECT table_schema, table_name, column_name, data_type, udt_schema, udt_name,
       is_nullable, column_default, is_generated, generation_expression,
       character_maximum_length, numeric_precision, numeric_scale
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN
      ('carts','cart_items','products','product_variants','checkout_sessions','checkout_items','order_items')
ORDER BY table_name, ordinal_position;

SELECT c.conrelid::regclass AS relation, c.conname, pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
WHERE c.conrelid IN (SELECT cl.oid FROM pg_class cl JOIN pg_namespace n ON n.oid=cl.relnamespace
                    WHERE n.nspname='public' AND cl.relname IN
                    ('carts','cart_items','products','product_variants','checkout_sessions','checkout_items','order_items'));

SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes WHERE schemaname='public' AND tablename IN
      ('carts','cart_items','checkout_sessions','checkout_items','order_items');

-- Triggers and their functions may enforce expiry, immutable snapshots or totals.
SELECT t.tgrelid::regclass AS relation, pg_get_triggerdef(t.oid) AS trigger_definition,
       pg_get_functiondef(t.tgfoid) AS trigger_function
FROM pg_trigger t JOIN pg_class cl ON cl.oid=t.tgrelid JOIN pg_namespace n ON n.oid=cl.relnamespace
WHERE NOT t.tgisinternal AND n.nspname='public' AND cl.relname IN
      ('carts','cart_items','checkout_sessions','checkout_items','order_items');

SELECT pg_describe_object(d.classid,d.objid,d.objsubid) AS dependent_object,
       pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid) AS referenced_object, d.deptype
FROM pg_depend d
WHERE d.refclassid='pg_class'::regclass AND d.refobjid IN
      (SELECT cl.oid FROM pg_class cl JOIN pg_namespace n ON n.oid=cl.relnamespace
       WHERE n.nspname='public' AND cl.relname IN ('checkout_items','order_items','checkout_sessions','carts'));
ROLLBACK;

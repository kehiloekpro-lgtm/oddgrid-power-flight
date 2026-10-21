# PostgreSQL isolationtester specification: FRESH local oddgrid_checkout_isolated database ONLY.
# Load export-fixture.sql and the migration first. Do not point isolationtester at Supabase.
# Run later with PostgreSQL's isolationtester "host=127.0.0.1 dbname=oddgrid_checkout_isolated" < this-file.
# Not executed by single-connection embedded tests. No payment/order functions are invoked.
setup
{
 DO $$ BEGIN
   IF current_database() <> 'oddgrid_checkout_isolated' THEN
     RAISE EXCEPTION 'Dedicated isolated database required';
   END IF;
 END $$;
 INSERT INTO public.products(id,name,slug,currency,selling_price,status,sale_type,availability)
 VALUES ('a1000000-0000-4000-8000-000000000001','Concurrency fixture','concurrency-fixture','USD',100,'active','direct','confirmed_available');
 INSERT INTO public.product_variants(id,product_id,variant_name,currency,selling_price,availability,is_active)
 VALUES ('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','Selected','USD',300,'confirmed_available',true);
 INSERT INTO public.carts(id,guest_token,currency) VALUES
 ('a3000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000001','USD'),
 ('a3000000-0000-4000-8000-000000000002','a4000000-0000-4000-8000-000000000002','USD');
 INSERT INTO public.cart_items(cart_id,product_id,variant_id,quantity) VALUES
 ('a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001',2),
 ('a3000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001',1);
}
teardown
{
 DO $$ BEGIN
   IF (SELECT count(*) FROM public.checkout_sessions WHERE idempotency_key='a5000000-0000-4000-8000-000000000001') <> 1 OR EXISTS (
       SELECT 1 FROM public.checkout_sessions cs WHERE cs.cart_id='a3000000-0000-4000-8000-000000000001'
       AND cs.subtotal IS DISTINCT FROM (SELECT sum(i.line_total) FROM public.checkout_items i WHERE i.checkout_session_id=cs.id)
   ) THEN RAISE EXCEPTION 'Duplicate/partial checkout snapshot'; END IF;
 END $$;
 DELETE FROM public.checkout_sessions WHERE cart_id IN ('a3000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000002');
 DELETE FROM public.carts WHERE id IN ('a3000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000002');
 DELETE FROM public.product_variants WHERE id='a2000000-0000-4000-8000-000000000001';
 DELETE FROM public.products WHERE id='a1000000-0000-4000-8000-000000000001';
}
session "first"
step "first_begin" { BEGIN; }
step "first_lock" { SELECT id FROM public.carts WHERE id='a3000000-0000-4000-8000-000000000001' FOR UPDATE; }
step "first_prepare" { SELECT public.checkout_prepare_bridge('a3000000-0000-4000-8000-000000000001','fixture@example.test',NULL,'Fixture',NULL,'Fixture',NULL,'Fixture',NULL,NULL,'US','a5000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000001'); }
step "first_commit" { COMMIT; }

session "retry"
step "retry_begin" { BEGIN; }
step "retry_prepare" { SELECT public.checkout_prepare_bridge('a3000000-0000-4000-8000-000000000001','fixture@example.test',NULL,'Fixture',NULL,'Fixture',NULL,'Fixture',NULL,NULL,'US','a5000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000001'); }
step "retry_commit" { COMMIT; }

session "price"
step "price_begin" { BEGIN; }
step "price_update" { UPDATE public.product_variants SET selling_price=400 WHERE id='a2000000-0000-4000-8000-000000000001'; }
step "price_commit" { COMMIT; }

session "cartedit"
step "edit_begin" { BEGIN; }
step "edit_quantity" { UPDATE public.cart_items SET quantity=3 WHERE cart_id='a3000000-0000-4000-8000-000000000001'; }
step "edit_commit" { COMMIT; }

session "foreigncart"
step "foreign_begin" { BEGIN; }
step "foreign_prepare" { SELECT public.checkout_prepare_bridge('a3000000-0000-4000-8000-000000000002','fixture@example.test',NULL,'Fixture',NULL,'Fixture',NULL,'Fixture',NULL,NULL,'US','a5000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000002'); }
step "foreign_commit" { COMMIT; }

# Retry waits, then returns the original UUID; exactly one checkout.
permutation "first_begin" "first_prepare" "retry_begin" "retry_prepare" "first_commit" "retry_commit"
# A catalogue write waits for snapshots, or checkout waits and uses the committed new price.
permutation "first_begin" "first_prepare" "price_begin" "price_update" "first_commit" "price_commit"
permutation "price_begin" "price_update" "first_begin" "first_prepare" "price_commit" "first_commit"
# Existing parent-lock trigger serializes cart edits; changed-cart retry must fail (22023).
permutation "first_begin" "first_prepare" "edit_begin" "edit_quantity" "first_commit" "edit_commit" "retry_begin" "retry_prepare" "retry_commit"
# Cross-cart UUID reuse waits then rejects (22023), not a second or foreign checkout.
permutation "first_begin" "first_prepare" "foreign_begin" "foreign_prepare" "first_commit" "foreign_commit"

# Cart edits that commit first are fully incorporated.
permutation "edit_begin" "edit_quantity" "first_begin" "first_prepare" "edit_commit" "first_commit"
# Exercise existing tuple/parent lock inversion; explicit same-key retry after a possible deadlock rollback.
permutation "first_begin" "first_lock" "edit_begin" "edit_quantity" "first_prepare" "first_commit" "edit_commit" "retry_begin" "retry_prepare" "retry_commit"

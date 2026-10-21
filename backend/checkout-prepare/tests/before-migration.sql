-- Fresh fixture only, loaded before migration to prove historical snapshots remain unchanged.
INSERT INTO public.products (id,name,slug,currency,selling_price,sale_type,status,availability)
VALUES ('90000000-0000-4000-8000-000000000001','Historical fixture','historical-fixture','USD',12.50,'direct','active','confirmed_available');
INSERT INTO public.checkout_sessions (id,email,currency,subtotal,total_amount,shipping_recipient_name,shipping_line1,shipping_city,shipping_country_code,idempotency_key)
VALUES ('90000000-0000-4000-8000-000000000002','fixture@example.test','USD',25,25,'Fixture','Fixture','Fixture','US','90000000-0000-4000-8000-000000000003');
INSERT INTO public.checkout_items (checkout_session_id,product_id,product_name,quantity,unit_price)
VALUES ('90000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000001','Historical fixture',2,12.50);

-- Forward-only proposal. NOT applied to any hosted project.
-- Baseline: 26 October isolated regression evidence; no provider calls or data backfill.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
-- Prevent concurrent table mutation while replacing both entry points atomically.
LOCK TABLE public.payments, public.checkout_sessions, public.checkout_items, public.orders
    IN SHARE ROW EXCLUSIVE MODE;
DO $guard$
DECLARE r record;
BEGIN
    FOR r IN SELECT * FROM (VALUES
       ('private.create_payment_attempt(uuid,text,public.payment_flow,uuid)', '8d41ca1a42fa25c6ad208259a4c357af'),
       ('private.finalize_order_from_payment(uuid)', 'a971bc600a7a165aa061baadc714a487')
    ) AS expected(signature, body_hash)
    LOOP
        IF (SELECT pg_catalog.md5(pg_catalog.btrim(pg_catalog.regexp_replace(prosrc, '[[:space:]]+', ' ', 'g')))
            FROM pg_catalog.pg_proc WHERE oid = r.signature::regprocedure) IS DISTINCT FROM r.body_hash THEN
            RAISE EXCEPTION 'Payment routine definition drift: %', r.signature;
        END IF;
        IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid = r.signature::regprocedure
                   AND (NOT p.prosecdef OR p.proowner <> 'postgres'::regrole
                        OR p.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
                        OR pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
                        OR pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
                        OR NOT pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE'))) THEN
            RAISE EXCEPTION 'Payment routine security prerequisite drift: %', r.signature;
        END IF;
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_index i
        WHERE i.indexrelid = 'public.payments_idempotency_idx'::regclass
        AND i.indisunique AND i.indisvalid AND i.indpred IS NULL
        AND pg_catalog.pg_get_indexdef(i.indexrelid) =
            'CREATE UNIQUE INDEX payments_idempotency_idx ON public.payments USING btree (idempotency_key)') THEN
        RAISE EXCEPTION 'Payment idempotency uniqueness drift';
    END IF;
END;
$guard$;
CREATE TEMP TABLE oddgrid_payment_acl_before ON COMMIT DROP AS
SELECT oid, proowner, proacl, proconfig, prosecdef FROM pg_catalog.pg_proc
WHERE oid IN ('private.create_payment_attempt(uuid,text,public.payment_flow,uuid)'::regprocedure,
              'private.finalize_order_from_payment(uuid)'::regprocedure);

CREATE OR REPLACE FUNCTION private.create_payment_attempt(
    p_checkout_session_id uuid, p_provider text, p_flow public.payment_flow,
    p_idempotency_key uuid DEFAULT gen_random_uuid()
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
    v_existing public.payments%ROWTYPE;
    v_checkout public.checkout_sessions%ROWTYPE;
    v_payment_id uuid;
    v_provider text := pg_catalog.lower(pg_catalog.btrim(p_provider));
BEGIN
    IF p_checkout_session_id IS NULL OR p_idempotency_key IS NULL
       OR p_flow IS NULL OR v_provider IS NULL OR v_provider = '' THEN
        RAISE EXCEPTION 'Valid payment context required' USING ERRCODE = '22023';
    END IF;

    -- Serialize the globally unique request key before taking the checkout lock.
    -- Collisions only serialize unrelated requests; the unique index remains intact.
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('oddgrid-payment:' || p_idempotency_key::text, 0));

    SELECT * INTO v_checkout FROM public.checkout_sessions cs
    WHERE cs.id = p_checkout_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Checkout does not exist' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_existing FROM public.payments p
    WHERE p.idempotency_key = p_idempotency_key;
    IF FOUND THEN
        IF v_existing.checkout_session_id IS DISTINCT FROM v_checkout.id
           OR v_existing.provider IS DISTINCT FROM v_provider
           OR v_existing.flow IS DISTINCT FROM p_flow
           OR v_existing.currency IS DISTINCT FROM v_checkout.currency
           OR v_existing.amount IS DISTINCT FROM v_checkout.total_amount THEN
            RAISE EXCEPTION 'Payment request context mismatch' USING ERRCODE = '22023';
        END IF;
        -- A replay is not a new attempt, including after checkout completion.
        RETURN v_existing.id;
    END IF;

    IF v_checkout.status NOT IN ('open', 'payment_pending') THEN
        RAISE EXCEPTION 'Checkout is not payable in its current state';
    END IF;
    IF v_checkout.expires_at IS NOT NULL AND v_checkout.expires_at <= now() THEN
        RAISE EXCEPTION 'Checkout has expired';
    END IF;
    IF v_checkout.total_amount IS NULL OR v_checkout.total_amount <= 0
       OR v_checkout.currency IS NULL THEN
        RAISE EXCEPTION 'Invalid checkout amount or currency';
    END IF;

    INSERT INTO public.payments (
        order_id, checkout_session_id, provider, flow, status,
        currency, amount, idempotency_key
    ) VALUES (
        NULL, v_checkout.id, v_provider, p_flow, 'pending',
        v_checkout.currency, v_checkout.total_amount, p_idempotency_key
    ) RETURNING id INTO v_payment_id;
    UPDATE public.checkout_sessions SET status = 'payment_pending' WHERE id = v_checkout.id;
    RETURN v_payment_id;
END;
$function$;

CREATE OR REPLACE FUNCTION private.finalize_order_from_payment(p_payment_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    v_payment public.payments%rowtype;
    v_checkout public.checkout_sessions%rowtype;
    v_order public.orders%rowtype;

    v_order_id uuid;

    v_item_total numeric(12,2);
begin

    -- --------------------------------------------------------
    -- Lock payment.
    -- --------------------------------------------------------

    select *
    into v_payment
    from public.payments p
    where p.id = p_payment_id
    for update;

    if not found then
        raise exception 'Payment does not exist';
    end if;


    -- All paths, including replay, require the original trusted captured payment.
    IF v_payment.checkout_session_id IS NULL THEN
        RAISE EXCEPTION 'Payment is not linked to a checkout';
    END IF;
    IF v_payment.status IS DISTINCT FROM 'captured'::public.payment_status THEN
        RAISE EXCEPTION 'Payment has not been captured';
    END IF;
    IF v_payment.provider IS NULL OR pg_catalog.btrim(v_payment.provider) = ''
       OR v_payment.provider <> pg_catalog.lower(pg_catalog.btrim(v_payment.provider))
       OR v_payment.flow IS NULL THEN
        RAISE EXCEPTION 'Invalid payment provider context';
    END IF;

    -- --------------------------------------------------------
    -- Lock checkout.
    -- --------------------------------------------------------

    select *
    into v_checkout
    from public.checkout_sessions cs
    where cs.id = v_payment.checkout_session_id
    for update;

    if not found then
        raise exception 'Checkout does not exist';
    end if;


    -- --------------------------------------------------------
    -- Recalculate checkout snapshot total.
    -- --------------------------------------------------------

    PERFORM ci.id FROM public.checkout_items ci
    WHERE ci.checkout_session_id = v_checkout.id FOR SHARE;

    select
        coalesce(sum(ci.line_total), 0)
    into v_item_total
    from public.checkout_items ci
    where ci.checkout_session_id = v_checkout.id;


    if v_item_total <= 0 then
        raise exception 'Checkout contains no payable items';
    end if;


    -- V1:
    -- shipping/tax/discount are all zero.
    -- Still compare against checkout total to prevent tampering.

    if v_checkout.total_amount <> (
        v_item_total
        + v_checkout.shipping_amount
        + v_checkout.tax_amount
        - v_checkout.discount_amount
    )
    then
        raise exception 'Checkout total integrity check failed';
    end if;


    if v_payment.amount IS DISTINCT FROM v_checkout.total_amount
       or v_payment.currency IS DISTINCT FROM v_checkout.currency
    then
        raise exception 'Payment amount does not match checkout';
    end if;


    -- Resolve and validate the relationship only AFTER payment/snapshot checks.
    SELECT * INTO v_order FROM public.orders o
    WHERE o.checkout_session_id = v_checkout.id FOR UPDATE;
    IF FOUND THEN
        IF v_payment.order_id IS DISTINCT FROM v_order.id
           OR v_order.user_id IS DISTINCT FROM v_checkout.user_id
           OR v_order.currency IS DISTINCT FROM v_checkout.currency
           OR v_order.subtotal IS DISTINCT FROM v_checkout.subtotal
           OR v_order.shipping_amount IS DISTINCT FROM v_checkout.shipping_amount
           OR v_order.tax_amount IS DISTINCT FROM v_checkout.tax_amount
           OR v_order.discount_amount IS DISTINCT FROM v_checkout.discount_amount
           OR v_order.total_amount IS DISTINCT FROM v_checkout.total_amount
           OR NOT EXISTS (SELECT 1 FROM private.order_events e
               WHERE e.order_id = v_order.id AND e.event_type = 'order_created'
                 AND e.metadata->>'payment_id' = v_payment.id::text
                 AND e.metadata->>'checkout_session_id' = v_checkout.id::text
                 AND e.metadata->>'payment_provider' = v_payment.provider
                 AND e.metadata->>'payment_flow' = v_payment.flow::text)
           OR EXISTS (SELECT 1 FROM public.payments p
                      WHERE p.order_id = v_order.id AND p.id <> v_payment.id) THEN
            RAISE EXCEPTION 'Existing order payment context mismatch';
        END IF;
        RETURN v_order.id;
    END IF;
    IF v_payment.order_id IS NOT NULL THEN
        RAISE EXCEPTION 'Payment order does not belong to checkout';
    END IF;

    -- --------------------------------------------------------
    -- Create immutable order.
    -- --------------------------------------------------------

    insert into public.orders (
        checkout_session_id,
        user_id,

        status,

        customer_email,
        customer_phone,

        currency,

        subtotal,
        shipping_amount,
        tax_amount,
        discount_amount,
        total_amount,

        shipping_recipient_name,
        shipping_phone,

        shipping_line1,
        shipping_line2,

        shipping_city,
        shipping_region,
        shipping_postal_code,
        shipping_country_code,

        supplier_confirmation_due_at
    )
    values (
        v_checkout.id,
        v_checkout.user_id,

        'awaiting_supplier_confirmation',

        v_checkout.email,
        v_checkout.phone,

        v_checkout.currency,

        v_checkout.subtotal,
        v_checkout.shipping_amount,
        v_checkout.tax_amount,
        v_checkout.discount_amount,
        v_checkout.total_amount,

        v_checkout.shipping_recipient_name,
        v_checkout.shipping_phone,

        v_checkout.shipping_line1,
        v_checkout.shipping_line2,

        v_checkout.shipping_city,
        v_checkout.shipping_region,
        v_checkout.shipping_postal_code,
        v_checkout.shipping_country_code,

        now() + interval '24 hours'
    )
    returning id
    into v_order_id;


    -- --------------------------------------------------------
    -- Freeze order item snapshots.
    -- --------------------------------------------------------

    insert into public.order_items (
        order_id,
        product_id,
        variant_id,
        variant_name,

        product_name,
        product_sku,
        product_model,
        brand_name,

        unit_price,
        quantity
    )
    select
        v_order_id,
        ci.product_id,
        ci.variant_id,
        ci.variant_name,

        ci.product_name,
        ci.product_sku,
        ci.product_model,
        ci.brand_name,

        ci.unit_price,
        ci.quantity

    from public.checkout_items ci
    where ci.checkout_session_id = v_checkout.id;


    -- --------------------------------------------------------
    -- Link payment to order.
    -- --------------------------------------------------------

    update public.payments
    set order_id = v_order_id
    where id = v_payment.id;


    -- --------------------------------------------------------
    -- Complete checkout/cart.
    -- --------------------------------------------------------

    update public.checkout_sessions
    set status = 'completed'
    where id = v_checkout.id;


    if v_checkout.cart_id is not null then

        update public.carts
        set status = 'converted'
        where id = v_checkout.cart_id;

    end if;


    -- --------------------------------------------------------
    -- Audit event.
    -- --------------------------------------------------------

    insert into private.order_events (
        order_id,
        event_type,
        from_status,
        to_status,
        metadata
    )
    values (
        v_order_id,
        'order_created',
        null,
        'awaiting_supplier_confirmation',
        jsonb_build_object(
            'payment_id', v_payment.id,
            'checkout_session_id', v_checkout.id,
            'payment_provider', v_payment.provider,
            'payment_flow', v_payment.flow
        )
    );


    return v_order_id;

end;
$function$
;

DO $verify$
BEGIN
    IF EXISTS (SELECT 1 FROM oddgrid_payment_acl_before b JOIN pg_catalog.pg_proc p USING (oid)
        WHERE p.proowner IS DISTINCT FROM b.proowner OR p.proacl IS DISTINCT FROM b.proacl
           OR p.proconfig IS DISTINCT FROM b.proconfig OR p.prosecdef IS DISTINCT FROM b.prosecdef) THEN
        RAISE EXCEPTION 'Payment routine security metadata changed';
    END IF;
END;
$verify$;
COMMIT;
;

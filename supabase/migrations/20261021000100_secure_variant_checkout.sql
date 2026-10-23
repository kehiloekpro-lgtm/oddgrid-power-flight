-- Prepared from authoritative 2026-10-21 SQL export (SHA256
-- 8d2d579acabeb388749bfc66a473fa922c1aa5064f4794a8e79b4f0c7a78838b).
-- REVIEW/APPLY ONLY IN AN APPROVED ENVIRONMENT. No data seeding, payments or finalization calls.
-- Transactional, one-time migration; no CASCADE, historical backfill or RLS changes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $guard$
BEGIN
IF (SELECT pg_catalog.md5(pg_catalog.btrim(pg_catalog.regexp_replace(p.prosrc, '[[:space:]]+', ' ', 'g'))) FROM pg_catalog.pg_proc p WHERE p.oid='private.create_checkout_from_cart(uuid,text,text,text,text,text,text,text,text,text,character,uuid)'::regprocedure) <> '96f5a3d30e7db98e4f49dde69acef18b' THEN RAISE EXCEPTION 'Definition drift: private.create_checkout_from_cart; re-export before applying'; END IF;
IF (SELECT pg_catalog.md5(pg_catalog.btrim(pg_catalog.regexp_replace(p.prosrc, '[[:space:]]+', ' ', 'g'))) FROM pg_catalog.pg_proc p WHERE p.oid='private.finalize_order_from_payment(uuid)'::regprocedure) <> '6f9ed92cfcf660c7490214bafbc45ae5' THEN RAISE EXCEPTION 'Definition drift: private.finalize_order_from_payment; re-export before applying'; END IF;
IF (SELECT pg_catalog.md5(pg_catalog.btrim(pg_catalog.regexp_replace(p.prosrc, '[[:space:]]+', ' ', 'g'))) FROM pg_catalog.pg_proc p WHERE p.oid='public.checkout_prepare_bridge(uuid,text,text,text,text,text,text,text,text,text,character,uuid)'::regprocedure) <> 'bc35620e779c0ab0f245077ab49f9fe6' THEN RAISE EXCEPTION 'Definition drift: public.checkout_prepare_bridge; re-export before applying'; END IF;
IF (SELECT pg_catalog.md5(pg_catalog.btrim(pg_catalog.regexp_replace(p.prosrc, '[[:space:]]+', ' ', 'g'))) FROM pg_catalog.pg_proc p WHERE p.oid='private.lock_cart_for_item_write()'::regprocedure) <> 'faf47ac7ba3aead5080bd9abb13012a5' THEN
    RAISE EXCEPTION 'Cart locking trigger function drift; review before applying';
END IF;
IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid IN (
    'private.create_checkout_from_cart(uuid,text,text,text,text,text,text,text,text,text,character,uuid)'::regprocedure,
    'public.checkout_prepare_bridge(uuid,text,text,text,text,text,text,text,text,text,character,uuid)'::regprocedure)
    AND (pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') OR
         pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE'))) THEN
    RAISE EXCEPTION 'Unexpected checkout RPC privileges; review ACL drift';
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.checkout_items'::regclass
    AND conname='checkout_items_checkout_session_id_product_id_key'
    AND pg_catalog.pg_get_constraintdef(oid)='UNIQUE (checkout_session_id, product_id)') THEN
    RAISE EXCEPTION 'Unexpected checkout item uniqueness; review schema drift';
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.cart_items'::regclass
    AND tgname='trg_lock_cart_for_item_write' AND tgenabled='O'
    AND tgfoid='private.lock_cart_for_item_write()'::regprocedure) THEN
    RAISE EXCEPTION 'Required cart write locking trigger missing';
END IF;
IF (SELECT count(*) FROM pg_catalog.pg_attribute
    WHERE attrelid IN ('public.checkout_items'::regclass,'public.order_items'::regclass)
    AND attname='line_total' AND attgenerated='s') <> 2 THEN
    RAISE EXCEPTION 'Expected generated snapshot line totals';
END IF;
END;
$guard$;

ALTER TABLE public.checkout_items ADD COLUMN variant_id uuid, ADD COLUMN variant_name text;
ALTER TABLE public.order_items ADD COLUMN variant_id uuid, ADD COLUMN variant_name text;
-- Identity snapshots intentionally have no new FK: deleting/renaming a catalogue variant
-- must not null or delete frozen history. Existing product references remain unchanged.
ALTER TABLE public.checkout_items DROP CONSTRAINT checkout_items_checkout_session_id_product_id_key;
CREATE UNIQUE INDEX checkout_items_unique_base_product
  ON public.checkout_items (checkout_session_id, product_id) WHERE variant_id IS NULL;
CREATE UNIQUE INDEX checkout_items_unique_selected_variant
  ON public.checkout_items (checkout_session_id, variant_id) WHERE variant_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.create_checkout_from_cart(
    p_cart_id uuid, p_email text, p_phone text,
    p_shipping_recipient_name text, p_shipping_phone text,
    p_shipping_line1 text, p_shipping_line2 text, p_shipping_city text,
    p_shipping_region text, p_shipping_postal_code text,
    p_shipping_country_code character, p_idempotency_key uuid, p_guest_token uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
    v_cart public.carts%ROWTYPE;
    v_existing public.checkout_sessions%ROWTYPE;
    v_checkout_id uuid;
    v_subtotal numeric(12,2);
    v_invalid_count integer;
    v_lines jsonb;
    v_composition jsonb;
BEGIN
    IF p_cart_id IS NULL OR p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'Valid cart and request key required' USING ERRCODE = '22023';
    END IF;

    -- Serialize one UUID request key even when supplied concurrently for different carts.
    -- The unique checkout_sessions_idempotency_idx remains the final uniqueness boundary.
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('oddgrid-checkout:' || p_idempotency_key::text, 0));

    SELECT * INTO v_cart FROM public.carts c WHERE c.id = p_cart_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cart not found or unauthorized' USING ERRCODE = '42501';
    END IF;
    -- Service-role auth.uid() is NULL: possession must be checked INSIDE this lock.
    IF v_cart.user_id IS NULL THEN
        IF p_guest_token IS NULL OR v_cart.guest_token IS DISTINCT FROM p_guest_token THEN
            RAISE EXCEPTION 'Cart not found or unauthorized' USING ERRCODE = '42501';
        END IF;
    ELSIF auth.uid() IS NULL OR
        (v_cart.user_id IS DISTINCT FROM auth.uid() AND NOT private.is_staff_or_admin()) THEN
        RAISE EXCEPTION 'Cart not found or unauthorized' USING ERRCODE = '42501';
    END IF;
    IF v_cart.status IS DISTINCT FROM 'active' THEN
        RAISE EXCEPTION 'Cart is not active' USING ERRCODE = '22023';
    END IF;
    -- No fabricated cart lifetime: the exported carts table has no expires_at.
    IF v_cart.currency::text NOT IN ('USD', 'ZAR') THEN
        RAISE EXCEPTION 'Unsupported cart currency' USING ERRCODE = '22023';
    END IF;
    IF p_email IS NULL OR pg_catalog.btrim(p_email) = '' OR
       p_shipping_recipient_name IS NULL OR pg_catalog.btrim(p_shipping_recipient_name) = '' OR
       p_shipping_line1 IS NULL OR pg_catalog.btrim(p_shipping_line1) = '' OR
       p_shipping_city IS NULL OR pg_catalog.btrim(p_shipping_city) = '' OR
       p_shipping_country_code IS NULL OR p_shipping_country_code::text !~ '^[A-Z]{2}$' THEN
        RAISE EXCEPTION 'Required contact or shipping information missing' USING ERRCODE = '22023';
    END IF;

    -- Existing trg_lock_cart_for_item_write locks this same parent for every item write.
    PERFORM 1 FROM public.cart_items ci WHERE ci.cart_id = p_cart_id ORDER BY ci.id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cart is empty' USING ERRCODE = '22023';
    END IF;
    PERFORM 1 FROM public.products p
      JOIN public.cart_items ci ON ci.product_id = p.id
      WHERE ci.cart_id = p_cart_id ORDER BY p.id FOR SHARE OF p;
    PERFORM 1 FROM public.product_variants v
      JOIN public.cart_items ci ON ci.variant_id = v.id
      WHERE ci.cart_id = p_cart_id ORDER BY v.id FOR SHARE OF v;

    SELECT count(*) INTO v_invalid_count
    FROM public.cart_items ci
    LEFT JOIN public.products p ON p.id = ci.product_id
    LEFT JOIN public.product_variants v ON v.id = ci.variant_id
    WHERE ci.cart_id = p_cart_id AND (
        ci.quantity IS NULL OR ci.quantity < 1 OR ci.quantity > 100 OR p.id IS NULL OR
        p.status IS DISTINCT FROM 'active' OR p.sale_type IS DISTINCT FROM 'direct' OR
        p.currency IS DISTINCT FROM v_cart.currency OR
        (ci.variant_id IS NOT NULL AND
           (v.id IS NULL OR v.product_id IS DISTINCT FROM p.id OR v.is_active IS DISTINCT FROM true OR
            v.currency IS DISTINCT FROM v_cart.currency)) OR
        (CASE WHEN ci.variant_id IS NOT NULL THEN v.availability ELSE p.availability END)
            IS DISTINCT FROM 'confirmed_available' OR
        (CASE WHEN ci.variant_id IS NOT NULL THEN v.selling_price ELSE p.selling_price END) IS NULL OR
        (CASE WHEN ci.variant_id IS NOT NULL THEN v.selling_price ELSE p.selling_price END) <= 0 OR
        (CASE WHEN ci.variant_id IS NOT NULL THEN v.selling_price ELSE p.selling_price END)::text
            IN ('NaN', 'Infinity', '-Infinity')
    );
    IF v_invalid_count > 0 THEN
        RAISE EXCEPTION 'Cart contains invalid or unavailable products' USING ERRCODE = '22023';
    END IF;

    -- Freeze one projection; subtotal AND inserted snapshots consume these exact values.
    SELECT jsonb_agg(jsonb_build_object(
        'product_id', p.id, 'variant_id', ci.variant_id,
        'variant_name', CASE WHEN ci.variant_id IS NOT NULL THEN v.variant_name ELSE NULL END,
        'product_name', p.name,
        'product_sku', CASE WHEN ci.variant_id IS NOT NULL THEN v.sku ELSE p.sku END,
        'product_model', p.model, 'brand_name', b.name, 'quantity', ci.quantity,
        'unit_price', CASE WHEN ci.variant_id IS NOT NULL THEN v.selling_price ELSE p.selling_price END
    ) ORDER BY ci.product_id, ci.variant_id NULLS FIRST)
    INTO v_lines
    FROM public.cart_items ci JOIN public.products p ON p.id = ci.product_id
    LEFT JOIN public.product_variants v ON v.id = ci.variant_id AND v.product_id = p.id
    LEFT JOIN public.brands b ON b.id = p.brand_id
    WHERE ci.cart_id = p_cart_id;

    SELECT sum(x.unit_price * x.quantity),
           jsonb_agg(jsonb_build_array(x.product_id, x.variant_id, x.quantity)
                     ORDER BY x.product_id, x.variant_id NULLS FIRST)
    INTO v_subtotal, v_composition
    FROM jsonb_to_recordset(v_lines) AS x(product_id uuid, variant_id uuid, quantity integer, unit_price numeric);
    IF v_subtotal IS NULL OR v_subtotal <= 0 THEN
        RAISE EXCEPTION 'Checkout total must be positive' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_existing FROM public.checkout_sessions cs
      WHERE cs.idempotency_key = p_idempotency_key FOR UPDATE;
    IF FOUND THEN
        IF v_existing.currency IS DISTINCT FROM v_cart.currency OR
           v_existing.user_id IS DISTINCT FROM v_cart.user_id THEN
            RAISE EXCEPTION 'Idempotency key reused with changed cart ownership or currency' USING ERRCODE = '22023';
        END IF;
        IF ROW(v_existing.cart_id, v_existing.email, v_existing.phone,
            v_existing.shipping_recipient_name, v_existing.shipping_phone,
            v_existing.shipping_line1, v_existing.shipping_line2, v_existing.shipping_city,
            v_existing.shipping_region, v_existing.shipping_postal_code, v_existing.shipping_country_code)
        IS DISTINCT FROM ROW(p_cart_id, p_email, p_phone,
            p_shipping_recipient_name, p_shipping_phone, p_shipping_line1, p_shipping_line2,
            p_shipping_city, p_shipping_region, p_shipping_postal_code, p_shipping_country_code) THEN
            RAISE EXCEPTION 'Idempotency key reused with different checkout details' USING ERRCODE = '22023';
        END IF;
        IF v_existing.status NOT IN ('open', 'payment_pending') OR
           v_existing.expires_at IS NULL OR v_existing.expires_at <= clock_timestamp() THEN
            RAISE EXCEPTION 'Existing checkout is no longer reusable' USING ERRCODE = '22023';
        END IF;
        IF (SELECT jsonb_agg(jsonb_build_array(i.product_id, i.variant_id, i.quantity)
                            ORDER BY i.product_id, i.variant_id NULLS FIRST)
            FROM public.checkout_items i WHERE i.checkout_session_id = v_existing.id)
           IS DISTINCT FROM v_composition THEN
            RAISE EXCEPTION 'Idempotency key reused with a changed cart' USING ERRCODE = '22023';
        END IF;
        -- Replays retain the original frozen price, even if the eligible catalogue price changed.
        IF v_existing.subtotal <= 0 OR v_existing.total_amount <= 0 OR
           v_existing.subtotal::text IN ('NaN', 'Infinity', '-Infinity') OR
           v_existing.total_amount::text IN ('NaN', 'Infinity', '-Infinity') OR
           (SELECT coalesce(sum(i.line_total), 0) FROM public.checkout_items i
            WHERE i.checkout_session_id = v_existing.id) IS DISTINCT FROM v_existing.subtotal OR
           v_existing.total_amount IS DISTINCT FROM (v_existing.subtotal + v_existing.shipping_amount +
                                                     v_existing.tax_amount - v_existing.discount_amount) THEN
            RAISE EXCEPTION 'Checkout snapshot total mismatch' USING ERRCODE = '22023';
        END IF;
        RETURN v_existing.id;
    END IF;

    INSERT INTO public.checkout_sessions (
        cart_id, user_id, status, email, phone, currency,
        subtotal, shipping_amount, tax_amount, discount_amount, total_amount,
        shipping_recipient_name, shipping_phone, shipping_line1, shipping_line2,
        shipping_city, shipping_region, shipping_postal_code, shipping_country_code,
        idempotency_key, expires_at
    ) VALUES (
        p_cart_id, v_cart.user_id, 'open', p_email, p_phone, v_cart.currency,
        v_subtotal, 0, 0, 0, v_subtotal,
        p_shipping_recipient_name, p_shipping_phone, p_shipping_line1, p_shipping_line2,
        p_shipping_city, p_shipping_region, p_shipping_postal_code, p_shipping_country_code,
        p_idempotency_key, clock_timestamp() + INTERVAL '30 minutes'
    ) RETURNING id INTO v_checkout_id;

    INSERT INTO public.checkout_items (
        checkout_session_id, product_id, variant_id, variant_name,
        product_name, product_sku, product_model, brand_name, quantity, unit_price
    ) SELECT v_checkout_id, x.product_id, x.variant_id, x.variant_name,
             x.product_name, x.product_sku, x.product_model, x.brand_name, x.quantity, x.unit_price
      FROM jsonb_to_recordset(v_lines) AS x(product_id uuid, variant_id uuid, variant_name text,
          product_name text, product_sku text, product_model text, brand_name text,
          quantity integer, unit_price numeric);
    IF (SELECT coalesce(sum(i.line_total), 0) FROM public.checkout_items i
        WHERE i.checkout_session_id = v_checkout_id) IS DISTINCT FROM v_subtotal THEN
        RAISE EXCEPTION 'Checkout snapshot total mismatch' USING ERRCODE = '22023';
    END IF;
    RETURN v_checkout_id;
END;
$function$;

-- Legacy private signature cannot bypass guest authorization.
CREATE OR REPLACE FUNCTION private.create_checkout_from_cart(p_cart_id uuid, p_email text, p_phone text, p_shipping_recipient_name text, p_shipping_phone text, p_shipping_line1 text, p_shipping_line2 text, p_shipping_city text, p_shipping_region text, p_shipping_postal_code text, p_shipping_country_code character, p_idempotency_key uuid DEFAULT gen_random_uuid())
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 RETURN private.create_checkout_from_cart(p_cart_id, p_email, p_phone, p_shipping_recipient_name, p_shipping_phone, p_shipping_line1, p_shipping_line2, p_shipping_city, p_shipping_region, p_shipping_postal_code, p_shipping_country_code, p_idempotency_key, NULL::uuid);
END;
$function$;

-- Existing legacy bridge still delegates to the now-guarded legacy private signature.
CREATE OR REPLACE FUNCTION public.checkout_prepare_bridge(p_cart_id uuid, p_email text, p_phone text, p_shipping_recipient_name text, p_shipping_phone text, p_shipping_line1 text, p_shipping_line2 text, p_shipping_city text, p_shipping_region text, p_shipping_postal_code text, p_shipping_country_code character, p_idempotency_key uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
    RETURN private.create_checkout_from_cart(
        p_cart_id,
        p_email,
        p_phone,
        p_shipping_recipient_name,
        p_shipping_phone,
        p_shipping_line1,
        p_shipping_line2,
        p_shipping_city,
        p_shipping_region,
        p_shipping_postal_code,
        p_shipping_country_code,
        p_idempotency_key
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.checkout_prepare_bridge(p_cart_id uuid, p_email text, p_phone text, p_shipping_recipient_name text, p_shipping_phone text, p_shipping_line1 text, p_shipping_line2 text, p_shipping_city text, p_shipping_region text, p_shipping_postal_code text, p_shipping_country_code character, p_idempotency_key uuid, p_guest_token uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
 RETURN private.create_checkout_from_cart(p_cart_id, p_email, p_phone, p_shipping_recipient_name, p_shipping_phone, p_shipping_line1, p_shipping_line2, p_shipping_city, p_shipping_region, p_shipping_postal_code, p_shipping_country_code, p_idempotency_key, p_guest_token);
END;
$function$;

-- Only the order-item copy gains variant snapshot columns; all other finalization logic is unchanged.
CREATE OR REPLACE FUNCTION private.finalize_order_from_payment(p_payment_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    v_payment public.payments%rowtype;
    v_checkout public.checkout_sessions%rowtype;

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


    -- --------------------------------------------------------
    -- Already linked to order = idempotent success.
    -- --------------------------------------------------------

    if v_payment.order_id is not null then
        return v_payment.order_id;
    end if;


    if v_payment.checkout_session_id is null then
        raise exception 'Payment is not linked to a checkout';
    end if;


    -- --------------------------------------------------------
    -- Validate trusted payment state.
    -- --------------------------------------------------------

    if v_payment.flow = 'authorize_capture'
       and v_payment.status not in ('authorized', 'captured')
    then
        raise exception
            'Authorize/capture payment has not been authorized';
    end if;


    if v_payment.flow in ('immediate_capture', 'bank_push')
       and v_payment.status <> 'captured'
    then
        raise exception
            'Payment has not been captured';
    end if;


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
    -- Existing order from same checkout = link and return.
    -- --------------------------------------------------------

    select o.id
    into v_order_id
    from public.orders o
    where o.checkout_session_id = v_checkout.id;

    if found then

        update public.payments
        set order_id = v_order_id
        where id = v_payment.id;

        return v_order_id;

    end if;


    -- --------------------------------------------------------
    -- Recalculate checkout snapshot total.
    -- --------------------------------------------------------

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


    if v_payment.amount <> v_checkout.total_amount
       or v_payment.currency <> v_checkout.currency
    then
        raise exception 'Payment amount does not match checkout';
    end if;


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
$function$;

ALTER FUNCTION private.create_checkout_from_cart(uuid,text,text,text,text,text,text,text,text,text,character,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.create_checkout_from_cart(uuid,text,text,text,text,text,text,text,text,text,character,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.create_checkout_from_cart(uuid,text,text,text,text,text,text,text,text,text,character,uuid) TO postgres, service_role;

ALTER FUNCTION private.create_checkout_from_cart(uuid,text,text,text,text,text,text,text,text,text,character,uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.create_checkout_from_cart(uuid,text,text,text,text,text,text,text,text,text,character,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.create_checkout_from_cart(uuid,text,text,text,text,text,text,text,text,text,character,uuid,uuid) TO postgres, service_role;

ALTER FUNCTION public.checkout_prepare_bridge(uuid,text,text,text,text,text,text,text,text,text,character,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.checkout_prepare_bridge(uuid,text,text,text,text,text,text,text,text,text,character,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.checkout_prepare_bridge(uuid,text,text,text,text,text,text,text,text,text,character,uuid) TO postgres, service_role;

ALTER FUNCTION public.checkout_prepare_bridge(uuid,text,text,text,text,text,text,text,text,text,character,uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.checkout_prepare_bridge(uuid,text,text,text,text,text,text,text,text,text,character,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.checkout_prepare_bridge(uuid,text,text,text,text,text,text,text,text,text,character,uuid,uuid) TO postgres, service_role;

-- Fail closed if role defaults granted a newly created overload to any other role.
DO $acl$ BEGIN
 IF EXISTS (
   SELECT 1 FROM pg_catalog.pg_proc p
   CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f',p.proowner))) a
   WHERE p.oid IN (
     'private.create_checkout_from_cart(uuid,text,text,text,text,text,text,text,text,text,character,uuid)'::regprocedure,
     'private.create_checkout_from_cart(uuid,text,text,text,text,text,text,text,text,text,character,uuid,uuid)'::regprocedure,
     'public.checkout_prepare_bridge(uuid,text,text,text,text,text,text,text,text,text,character,uuid)'::regprocedure,
     'public.checkout_prepare_bridge(uuid,text,text,text,text,text,text,text,text,text,character,uuid,uuid)'::regprocedure)
   AND a.grantee NOT IN ('postgres'::regrole, 'service_role'::regrole)
 ) THEN RAISE EXCEPTION 'Unexpected checkout function ACL; review default privileges'; END IF;
END; $acl$;

-- Refresh PostgREST's overload metadata only after this transaction commits.
NOTIFY pgrst, 'reload schema';
COMMIT;

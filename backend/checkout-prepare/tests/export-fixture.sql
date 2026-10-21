-- ISOLATED TEST DATABASE ONLY. Metadata-derived fixture, not a full Supabase replica.
-- No supplier/customer data; all auth helpers and non-exported payment/order support tables are test stubs.
-- Refuse an existing catalogue before any mutation. Driver must explicitly opt in on a fresh database.
DO $guard$ BEGIN
 IF current_setting('oddgrid.isolated_test', true) IS DISTINCT FROM 'yes' OR
    to_regclass('public.carts') IS NOT NULL OR to_regclass('public.products') IS NOT NULL THEN
   RAISE EXCEPTION 'Fresh isolated test database and explicit opt-in required';
 END IF;
END; $guard$;
CREATE SCHEMA private;
CREATE SCHEMA auth;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION private.is_staff_or_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('oddgrid.test_staff',true),'')='yes' $$;
CREATE TABLE public.brands (id uuid PRIMARY KEY, name text NOT NULL);
CREATE TABLE public.categories (id uuid PRIMARY KEY);
CREATE TABLE public.orders (id uuid PRIMARY KEY, checkout_session_id uuid);
CREATE TABLE public.payments (id uuid PRIMARY KEY, order_id uuid, checkout_session_id uuid, flow text, status text, amount numeric(12,2), currency char(3), provider text);
CREATE TABLE private.product_costs (product_id uuid, updated_at timestamptz);
CREATE TYPE public.cart_status AS ENUM ('active','converted','abandoned');
CREATE TYPE public.checkout_status AS ENUM ('open','payment_pending','completed','expired','cancelled');
CREATE TYPE public.product_status AS ENUM ('active','draft','archived');
CREATE TYPE public.product_sale_type AS ENUM ('direct','rfq');
CREATE TYPE public.availability_status AS ENUM ('available_to_order','confirmed_available','discontinued','out_of_stock');


CREATE TABLE public.cart_items (
 id uuid DEFAULT gen_random_uuid() NOT NULL,
 cart_id uuid NOT NULL,
 product_id uuid NOT NULL,
 quantity integer DEFAULT 1 NOT NULL,
 created_at timestamp with time zone DEFAULT now() NOT NULL,
 updated_at timestamp with time zone DEFAULT now() NOT NULL,
 variant_id uuid
);

CREATE TABLE public.carts (
 id uuid DEFAULT gen_random_uuid() NOT NULL,
 user_id uuid,
 guest_token uuid,
 currency character(3) DEFAULT 'ZAR'::bpchar NOT NULL,
 status public.cart_status DEFAULT 'active'::cart_status NOT NULL,
 created_at timestamp with time zone DEFAULT now() NOT NULL,
 updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.checkout_items (
 id uuid DEFAULT gen_random_uuid() NOT NULL,
 checkout_session_id uuid NOT NULL,
 product_id uuid,
 product_name text NOT NULL,
 product_sku text,
 product_model text,
 brand_name text,
 quantity integer NOT NULL,
 unit_price numeric(12,2) NOT NULL,
 line_total numeric(12,2) GENERATED ALWAYS AS ((unit_price * (quantity)::numeric)) STORED,
 created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.checkout_sessions (
 id uuid DEFAULT gen_random_uuid() NOT NULL,
 cart_id uuid,
 user_id uuid,
 status public.checkout_status DEFAULT 'open'::checkout_status NOT NULL,
 email text NOT NULL,
 phone text,
 currency character(3) DEFAULT 'ZAR'::bpchar NOT NULL,
 subtotal numeric(12,2) DEFAULT 0 NOT NULL,
 shipping_amount numeric(12,2) DEFAULT 0 NOT NULL,
 tax_amount numeric(12,2) DEFAULT 0 NOT NULL,
 discount_amount numeric(12,2) DEFAULT 0 NOT NULL,
 total_amount numeric(12,2) DEFAULT 0 NOT NULL,
 shipping_recipient_name text NOT NULL,
 shipping_phone text,
 shipping_line1 text NOT NULL,
 shipping_line2 text,
 shipping_city text NOT NULL,
 shipping_region text,
 shipping_postal_code text,
 shipping_country_code character(2) NOT NULL,
 expires_at timestamp with time zone,
 created_at timestamp with time zone DEFAULT now() NOT NULL,
 updated_at timestamp with time zone DEFAULT now() NOT NULL,
 idempotency_key uuid DEFAULT gen_random_uuid() NOT NULL
);

CREATE TABLE public.order_items (
 id uuid DEFAULT gen_random_uuid() NOT NULL,
 order_id uuid NOT NULL,
 product_id uuid,
 product_name text NOT NULL,
 product_sku text,
 product_model text,
 brand_name text,
 unit_price numeric(12,2) NOT NULL,
 quantity integer NOT NULL,
 line_total numeric(12,2) GENERATED ALWAYS AS ((unit_price * (quantity)::numeric)) STORED,
 created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.product_variants (
 id uuid DEFAULT gen_random_uuid() NOT NULL,
 product_id uuid NOT NULL,
 sku text,
 variant_name text NOT NULL,
 currency character(3) DEFAULT 'ZAR'::bpchar NOT NULL,
 selling_price numeric(12,2),
 availability public.availability_status DEFAULT 'available_to_order'::availability_status NOT NULL,
 is_active boolean DEFAULT false NOT NULL,
 created_at timestamp with time zone DEFAULT now() NOT NULL,
 updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.products (
 id uuid DEFAULT gen_random_uuid() NOT NULL,
 brand_id uuid,
 category_id uuid,
 name text NOT NULL,
 slug text NOT NULL,
 model text,
 sku text,
 description text,
 search_excerpt text,
 meta_title text,
 meta_description text,
 currency character(3) DEFAULT 'ZAR'::bpchar NOT NULL,
 selling_price numeric(12,2),
 sale_type public.product_sale_type DEFAULT 'direct'::product_sale_type NOT NULL,
 status public.product_status DEFAULT 'draft'::product_status NOT NULL,
 availability public.availability_status DEFAULT 'available_to_order'::availability_status NOT NULL,
 estimated_ship_days_min integer,
 estimated_ship_days_max integer,
 availability_verified_at timestamp with time zone,
 availability_expires_at timestamp with time zone,
 warranty_summary text,
 is_featured boolean DEFAULT false NOT NULL,
 created_at timestamp with time zone DEFAULT now() NOT NULL,
 updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.cart_items ADD CONSTRAINT cart_items_pkey PRIMARY KEY (id);

ALTER TABLE public.carts ADD CONSTRAINT carts_guest_token_key UNIQUE (guest_token);

ALTER TABLE public.carts ADD CONSTRAINT carts_pkey PRIMARY KEY (id);

ALTER TABLE public.checkout_items ADD CONSTRAINT checkout_items_checkout_session_id_product_id_key UNIQUE (checkout_session_id, product_id);

ALTER TABLE public.checkout_items ADD CONSTRAINT checkout_items_pkey PRIMARY KEY (id);

ALTER TABLE public.checkout_sessions ADD CONSTRAINT checkout_sessions_pkey PRIMARY KEY (id);

ALTER TABLE public.order_items ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);

ALTER TABLE public.product_variants ADD CONSTRAINT product_variants_id_product_id_key UNIQUE (id, product_id);

ALTER TABLE public.product_variants ADD CONSTRAINT product_variants_pkey PRIMARY KEY (id);

ALTER TABLE public.product_variants ADD CONSTRAINT product_variants_sku_key UNIQUE (sku);

ALTER TABLE public.products ADD CONSTRAINT products_pkey PRIMARY KEY (id);

ALTER TABLE public.products ADD CONSTRAINT products_sku_key UNIQUE (sku);

ALTER TABLE public.products ADD CONSTRAINT products_slug_key UNIQUE (slug);

ALTER TABLE public.cart_items ADD CONSTRAINT cart_items_cart_id_fkey FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE CASCADE;

ALTER TABLE public.cart_items ADD CONSTRAINT cart_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

ALTER TABLE public.cart_items ADD CONSTRAINT cart_items_quantity_check CHECK ((quantity > 0));

ALTER TABLE public.cart_items ADD CONSTRAINT cart_items_variant_product_fk FOREIGN KEY (variant_id, product_id) REFERENCES product_variants(id, product_id) ON DELETE RESTRICT;

ALTER TABLE public.carts ADD CONSTRAINT cart_has_owner CHECK (((user_id IS NOT NULL) OR (guest_token IS NOT NULL)));

ALTER TABLE public.carts ADD CONSTRAINT carts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.checkout_items ADD CONSTRAINT checkout_items_checkout_session_id_fkey FOREIGN KEY (checkout_session_id) REFERENCES checkout_sessions(id) ON DELETE CASCADE;

ALTER TABLE public.checkout_items ADD CONSTRAINT checkout_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;

ALTER TABLE public.checkout_items ADD CONSTRAINT checkout_items_quantity_check CHECK ((quantity > 0));

ALTER TABLE public.checkout_items ADD CONSTRAINT checkout_items_unit_price_check CHECK ((unit_price >= (0)::numeric));

ALTER TABLE public.checkout_sessions ADD CONSTRAINT checkout_sessions_cart_id_fkey FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE SET NULL;

ALTER TABLE public.checkout_sessions ADD CONSTRAINT checkout_sessions_discount_amount_check CHECK ((discount_amount >= (0)::numeric));

ALTER TABLE public.checkout_sessions ADD CONSTRAINT checkout_sessions_shipping_amount_check CHECK ((shipping_amount >= (0)::numeric));

ALTER TABLE public.checkout_sessions ADD CONSTRAINT checkout_sessions_subtotal_check CHECK ((subtotal >= (0)::numeric));

ALTER TABLE public.checkout_sessions ADD CONSTRAINT checkout_sessions_tax_amount_check CHECK ((tax_amount >= (0)::numeric));

ALTER TABLE public.checkout_sessions ADD CONSTRAINT checkout_sessions_total_amount_check CHECK ((total_amount >= (0)::numeric));

ALTER TABLE public.checkout_sessions ADD CONSTRAINT checkout_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.order_items ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

ALTER TABLE public.order_items ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;

ALTER TABLE public.order_items ADD CONSTRAINT order_items_quantity_check CHECK ((quantity > 0));

ALTER TABLE public.order_items ADD CONSTRAINT order_items_unit_price_check CHECK ((unit_price >= (0)::numeric));

ALTER TABLE public.product_variants ADD CONSTRAINT product_variants_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

ALTER TABLE public.product_variants ADD CONSTRAINT product_variants_selling_price_check CHECK (((selling_price IS NULL) OR (selling_price >= (0)::numeric)));

ALTER TABLE public.products ADD CONSTRAINT direct_product_has_price CHECK (((status <> 'active'::product_status) OR (sale_type = 'rfq'::product_sale_type) OR (selling_price IS NOT NULL)));

ALTER TABLE public.products ADD CONSTRAINT products_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL;

ALTER TABLE public.products ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL;

ALTER TABLE public.products ADD CONSTRAINT products_estimated_ship_days_max_check CHECK (((estimated_ship_days_max IS NULL) OR (estimated_ship_days_max >= 0)));

ALTER TABLE public.products ADD CONSTRAINT products_estimated_ship_days_min_check CHECK (((estimated_ship_days_min IS NULL) OR (estimated_ship_days_min >= 0)));

ALTER TABLE public.products ADD CONSTRAINT products_selling_price_check CHECK (((selling_price IS NULL) OR (selling_price >= (0)::numeric)));

ALTER TABLE public.products ADD CONSTRAINT products_ship_window_valid CHECK (((estimated_ship_days_min IS NULL) OR (estimated_ship_days_max IS NULL) OR (estimated_ship_days_max >= estimated_ship_days_min)));

CREATE INDEX IF NOT EXISTS cart_items_cart_idx ON public.cart_items USING btree (cart_id);

CREATE UNIQUE INDEX IF NOT EXISTS cart_items_pkey ON public.cart_items USING btree (id);

CREATE UNIQUE INDEX IF NOT EXISTS cart_items_unique_base_product ON public.cart_items USING btree (cart_id, product_id) WHERE (variant_id IS NULL);

CREATE UNIQUE INDEX IF NOT EXISTS cart_items_unique_selected_variant ON public.cart_items USING btree (cart_id, variant_id) WHERE (variant_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id ON public.cart_items USING btree (cart_id);

CREATE INDEX IF NOT EXISTS idx_cart_items_variant_id ON public.cart_items USING btree (variant_id);

CREATE UNIQUE INDEX IF NOT EXISTS carts_guest_token_key ON public.carts USING btree (guest_token);

CREATE UNIQUE INDEX IF NOT EXISTS carts_pkey ON public.carts USING btree (id);

CREATE INDEX IF NOT EXISTS carts_user_idx ON public.carts USING btree (user_id);

CREATE INDEX IF NOT EXISTS idx_carts_user_id ON public.carts USING btree (user_id) WHERE (user_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS checkout_items_checkout_idx ON public.checkout_items USING btree (checkout_session_id);

CREATE UNIQUE INDEX IF NOT EXISTS checkout_items_checkout_session_id_product_id_key ON public.checkout_items USING btree (checkout_session_id, product_id);

CREATE UNIQUE INDEX IF NOT EXISTS checkout_items_pkey ON public.checkout_items USING btree (id);

CREATE INDEX IF NOT EXISTS checkout_items_product_idx ON public.checkout_items USING btree (product_id);

CREATE INDEX IF NOT EXISTS checkout_sessions_cart_idx ON public.checkout_sessions USING btree (cart_id);

CREATE INDEX IF NOT EXISTS checkout_sessions_expires_idx ON public.checkout_sessions USING btree (expires_at) WHERE (status = ANY (ARRAY['open'::checkout_status, 'payment_pending'::checkout_status]));

CREATE UNIQUE INDEX IF NOT EXISTS checkout_sessions_idempotency_idx ON public.checkout_sessions USING btree (idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS checkout_sessions_pkey ON public.checkout_sessions USING btree (id);

CREATE INDEX IF NOT EXISTS checkout_sessions_status_idx ON public.checkout_sessions USING btree (status);

CREATE INDEX IF NOT EXISTS checkout_sessions_user_idx ON public.checkout_sessions USING btree (user_id);

CREATE INDEX IF NOT EXISTS order_items_order_idx ON public.order_items USING btree (order_id);

CREATE UNIQUE INDEX IF NOT EXISTS order_items_pkey ON public.order_items USING btree (id);

CREATE INDEX IF NOT EXISTS order_items_product_idx ON public.order_items USING btree (product_id);

CREATE UNIQUE INDEX IF NOT EXISTS product_variants_id_product_id_key ON public.product_variants USING btree (id, product_id);

CREATE UNIQUE INDEX IF NOT EXISTS product_variants_pkey ON public.product_variants USING btree (id);

CREATE UNIQUE INDEX IF NOT EXISTS product_variants_sku_key ON public.product_variants USING btree (sku);

CREATE INDEX IF NOT EXISTS products_availability_idx ON public.products USING btree (availability);

CREATE INDEX IF NOT EXISTS products_brand_idx ON public.products USING btree (brand_id);

CREATE INDEX IF NOT EXISTS products_category_idx ON public.products USING btree (category_id);

CREATE UNIQUE INDEX IF NOT EXISTS products_pkey ON public.products USING btree (id);

CREATE INDEX IF NOT EXISTS products_sale_type_idx ON public.products USING btree (sale_type);

CREATE UNIQUE INDEX IF NOT EXISTS products_sku_key ON public.products USING btree (sku);

CREATE UNIQUE INDEX IF NOT EXISTS products_slug_key ON public.products USING btree (slug);

CREATE INDEX IF NOT EXISTS products_status_idx ON public.products USING btree (status);

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.lock_cart_for_item_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_cart_id uuid;
    v_status text;
BEGIN
    IF TG_OP = 'UPDATE'
       AND NEW.cart_id IS DISTINCT FROM OLD.cart_id THEN
        RAISE EXCEPTION
            'Moving items between carts is not supported';
    END IF;

    IF TG_OP = 'DELETE' THEN
        v_cart_id := OLD.cart_id;
    ELSE
        v_cart_id := NEW.cart_id;
    END IF;

    SELECT c.status::text
    INTO v_status
    FROM public.carts c
    WHERE c.id = v_cart_id
    FOR UPDATE;

    IF NOT FOUND THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        END IF;

        RAISE EXCEPTION 'Cart does not exist';
    END IF;

    IF v_status <> 'active' THEN
        RAISE EXCEPTION
            'Cannot modify items in an inactive cart';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.refresh_product_profit_after_price_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin

  if new.selling_price is distinct from old.selling_price then
    update private.product_costs
    set updated_at = now()
    where product_id = new.id;
  end if;

  return new;
end;
$function$;

CREATE TRIGGER cart_items_set_updated_at BEFORE UPDATE ON public.cart_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_lock_cart_for_item_write BEFORE INSERT OR DELETE OR UPDATE ON public.cart_items FOR EACH ROW EXECUTE FUNCTION private.lock_cart_for_item_write();

CREATE TRIGGER carts_set_updated_at BEFORE UPDATE ON public.carts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER checkout_sessions_set_updated_at BEFORE UPDATE ON public.checkout_sessions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER products_refresh_profit AFTER UPDATE OF selling_price ON public.products FOR EACH ROW EXECUTE FUNCTION private.refresh_product_profit_after_price_change();

CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION private.create_checkout_from_cart(p_cart_id uuid, p_email text, p_phone text, p_shipping_recipient_name text, p_shipping_phone text, p_shipping_line1 text, p_shipping_line2 text, p_shipping_city text, p_shipping_region text, p_shipping_postal_code text, p_shipping_country_code character, p_idempotency_key uuid DEFAULT gen_random_uuid())
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_checkout_id uuid;
    v_existing public.checkout_sessions%ROWTYPE;
    v_user_id uuid;
    v_currency char(3);
    v_subtotal numeric(12,2);
    v_invalid_count integer;
BEGIN
    SELECT c.user_id, c.currency
    INTO v_user_id, v_currency
    FROM public.carts c
    WHERE c.id = p_cart_id
      AND c.status = 'active'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Cart does not exist or is not active';
    END IF;

    IF auth.uid() IS NOT NULL
       AND v_user_id IS DISTINCT FROM auth.uid()
       AND NOT private.is_staff_or_admin()
    THEN
        RAISE EXCEPTION
            'Cart does not belong to current user';
    END IF;

    -- Existing items cannot change during checkout.
    PERFORM 1
    FROM public.cart_items ci
    WHERE ci.cart_id = p_cart_id
    ORDER BY ci.id
    FOR UPDATE;

    -- A retry must match the original request exactly.
    SELECT *
    INTO v_existing
    FROM public.checkout_sessions cs
    WHERE cs.idempotency_key = p_idempotency_key;

    IF FOUND THEN
        IF ROW(
            v_existing.cart_id,
            v_existing.email,
            v_existing.phone,
            v_existing.shipping_recipient_name,
            v_existing.shipping_phone,
            v_existing.shipping_line1,
            v_existing.shipping_line2,
            v_existing.shipping_city,
            v_existing.shipping_region,
            v_existing.shipping_postal_code,
            v_existing.shipping_country_code
        ) IS DISTINCT FROM ROW(
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
            p_shipping_country_code
        ) THEN
            RAISE EXCEPTION
                'Idempotency key reused with different checkout details';
        END IF;

        IF v_existing.status NOT IN (
            'open', 'payment_pending'
        ) OR v_existing.expires_at <= NOW() THEN
            RAISE EXCEPTION
                'Existing checkout is no longer reusable';
        END IF;

        RETURN v_existing.id;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.cart_items ci
        WHERE ci.cart_id = p_cart_id
    ) THEN
        RAISE EXCEPTION 'Cart is empty';
    END IF;

    -- Lock product prices while creating snapshots.
    PERFORM 1
    FROM public.products p
    JOIN public.cart_items ci
      ON ci.product_id = p.id
    WHERE ci.cart_id = p_cart_id
    ORDER BY p.id
    FOR SHARE OF p;

    SELECT COUNT(*)
    INTO v_invalid_count
    FROM public.cart_items ci
    LEFT JOIN public.products p
      ON p.id = ci.product_id
    WHERE ci.cart_id = p_cart_id
      AND (
          ci.quantity <= 0
          OR p.id IS NULL
          OR p.status IS DISTINCT FROM 'active'
          OR p.availability IS NULL
          OR p.availability NOT IN (
              'available_to_order',
              'confirmed_available'
          )
          OR p.sale_type IS DISTINCT FROM 'direct'
          OR p.selling_price IS NULL
          OR p.selling_price <= 0
          OR p.currency IS DISTINCT FROM v_currency
      );

    IF v_invalid_count > 0 THEN
        RAISE EXCEPTION
            'Cart contains invalid or unavailable products';
    END IF;

    SELECT COALESCE(
        SUM(p.selling_price * ci.quantity), 0
    )
    INTO v_subtotal
    FROM public.cart_items ci
    JOIN public.products p
      ON p.id = ci.product_id
    WHERE ci.cart_id = p_cart_id;

    IF v_subtotal <= 0 THEN
        RAISE EXCEPTION
            'Checkout total must be positive';
    END IF;

    INSERT INTO public.checkout_sessions (
        cart_id, user_id, status,
        email, phone, currency,
        subtotal, shipping_amount,
        tax_amount, discount_amount, total_amount,
        shipping_recipient_name, shipping_phone,
        shipping_line1, shipping_line2,
        shipping_city, shipping_region,
        shipping_postal_code, shipping_country_code,
        idempotency_key, expires_at
    )
    VALUES (
        p_cart_id, v_user_id, 'open',
        p_email, p_phone, v_currency,
        v_subtotal, 0, 0, 0, v_subtotal,
        p_shipping_recipient_name, p_shipping_phone,
        p_shipping_line1, p_shipping_line2,
        p_shipping_city, p_shipping_region,
        p_shipping_postal_code, p_shipping_country_code,
        p_idempotency_key,
        NOW() + INTERVAL '30 minutes'
    )
    RETURNING id INTO v_checkout_id;

    INSERT INTO public.checkout_items (
        checkout_session_id, product_id,
        product_name, product_sku,
        product_model, brand_name,
        quantity, unit_price
    )
    SELECT
        v_checkout_id, p.id,
        p.name, p.sku,
        p.model, b.name,
        ci.quantity, p.selling_price
    FROM public.cart_items ci
    JOIN public.products p
      ON p.id = ci.product_id
    LEFT JOIN public.brands b
      ON b.id = p.brand_id
    WHERE ci.cart_id = p_cart_id;

    IF (
        SELECT COALESCE(SUM(i.line_total), 0)
        FROM public.checkout_items i
        WHERE i.checkout_session_id = v_checkout_id
    ) <> v_subtotal THEN
        RAISE EXCEPTION
            'Checkout snapshot total mismatch';
    END IF;

    RETURN v_checkout_id;
END;
$function$;

REVOKE ALL ON FUNCTION private.create_checkout_from_cart(uuid,text,text,text,text,text,text,text,text,text,character,uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION private.create_checkout_from_cart(uuid,text,text,text,text,text,text,text,text,text,character,uuid) TO postgres, service_role;

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

REVOKE ALL ON FUNCTION private.finalize_order_from_payment(uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION private.finalize_order_from_payment(uuid) TO postgres, service_role;

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

REVOKE ALL ON FUNCTION public.checkout_prepare_bridge(uuid,text,text,text,text,text,text,text,text,text,character,uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.checkout_prepare_bridge(uuid,text,text,text,text,text,text,text,text,text,character,uuid) TO postgres, service_role;

GRANT USAGE ON SCHEMA public, private, auth TO service_role;

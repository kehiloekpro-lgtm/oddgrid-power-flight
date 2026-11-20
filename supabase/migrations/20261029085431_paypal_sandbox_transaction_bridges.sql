BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
-- PROPOSAL ONLY: apply transactionally after review; never calls a provider.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace IN ('public'::regnamespace,'private'::regnamespace) AND proname LIKE 'oddgrid_paypal_%') THEN RAISE EXCEPTION 'Bridge already present or name collision'; END IF;
 IF (SELECT md5(btrim(regexp_replace(prosrc, '[[:space:]]+', ' ', 'g'))) FROM pg_proc WHERE oid='private.create_payment_attempt(uuid,text,public.payment_flow,uuid)'::regprocedure) <> 'f1e04c6d3dbd9872a76394b225023d82' OR
 (SELECT md5(btrim(regexp_replace(prosrc, '[[:space:]]+', ' ', 'g'))) FROM pg_proc WHERE oid='private.finalize_order_from_payment(uuid)'::regprocedure) <> 'f789d06837e9a3149dae8002f521f4e8' THEN RAISE EXCEPTION 'Corrected baseline required'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid IN ('private.create_payment_attempt(uuid,text,public.payment_flow,uuid)'::regprocedure,'private.finalize_order_from_payment(uuid)'::regprocedure) AND (NOT p.prosecdef OR p.proowner<>'postgres'::regrole OR p.proconfig IS DISTINCT FROM ARRAY['search_path=""'] OR has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))) THEN RAISE EXCEPTION 'Restricted baseline required'; END IF;
END $$;
ALTER TABLE public.payments ADD COLUMN provider_environment text, ADD COLUMN provider_merchant_id text;
CREATE UNIQUE INDEX payments_paypal_sandbox_order_unique ON public.payments(provider_reference) WHERE provider='paypal' AND provider_environment='sandbox' AND provider_reference IS NOT NULL;
CREATE UNIQUE INDEX payments_paypal_sandbox_active_checkout ON public.payments(checkout_session_id) WHERE provider='paypal' AND provider_environment='sandbox' AND status IN ('pending','authorized','captured');
CREATE FUNCTION private.oddgrid_paypal_context(p_payment uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('id',p.id,'checkout_id',p.checkout_session_id,'amount',p.amount::text,'currency',p.currency,'provider_reference',p.provider_reference,'provider_payment_id',p.provider_payment_id,'provider_environment',p.provider_environment,'provider_merchant_id',p.provider_merchant_id,'status',p.status,'order_id',p.order_id,'operation',p.failure_code) FROM public.payments p WHERE p.id=p_payment AND p.provider='paypal' AND p.provider_environment='sandbox'
$$;
CREATE FUNCTION private.oddgrid_paypal_snapshots(p_checkout uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.checkout_sessions; n bigint; s numeric;
BEGIN
 SELECT * INTO STRICT c FROM public.checkout_sessions WHERE id=p_checkout FOR UPDATE;
 PERFORM 1 FROM public.checkout_items WHERE checkout_session_id=c.id FOR SHARE;
 IF EXISTS(SELECT 1 FROM public.checkout_items WHERE checkout_session_id=c.id AND (quantity NOT BETWEEN 1 AND 99 OR unit_price<=0 OR unit_price::text IN ('NaN','Infinity','-Infinity'))) THEN RAISE EXCEPTION 'Invalid snapshot'; END IF;
 SELECT count(*),sum(line_total) INTO n,s FROM public.checkout_items WHERE checkout_session_id=c.id;
 IF c.currency IS DISTINCT FROM 'USD' OR n=0 OR s IS DISTINCT FROM c.subtotal OR c.total_amount IS DISTINCT FROM s+c.shipping_amount+c.tax_amount-c.discount_amount OR c.total_amount<=0 OR c.total_amount::text IN ('NaN','Infinity','-Infinity') OR c.shipping_amount<0 OR c.tax_amount<0 OR c.discount_amount<0 THEN RAISE EXCEPTION 'Invalid USD checkout'; END IF;
END $$;
CREATE FUNCTION public.oddgrid_paypal_prepare(p_checkout uuid,p_guest_token uuid,p_key uuid,p_merchant text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.checkout_sessions; p public.payments; v_id uuid;
BEGIN
 IF p_checkout IS NULL OR p_guest_token IS NULL OR p_key IS NULL OR p_merchant IS NULL OR length(p_merchant) NOT BETWEEN 1 AND 64 THEN RAISE EXCEPTION 'Invalid request'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('oddgrid-payment:'||p_key::text,0));
 SELECT * INTO STRICT c FROM public.checkout_sessions WHERE id=p_checkout FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.carts WHERE id=c.cart_id AND guest_token=p_guest_token AND user_id IS NULL) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
 PERFORM private.oddgrid_paypal_snapshots(c.id);
 SELECT * INTO p FROM public.payments WHERE idempotency_key=p_key;
 IF FOUND THEN
  IF p.checkout_session_id IS DISTINCT FROM c.id OR p.provider<>'paypal' OR p.flow<>'immediate_capture' OR p.amount IS DISTINCT FROM c.total_amount OR p.currency IS DISTINCT FROM c.currency OR p.provider_environment IS DISTINCT FROM 'sandbox' OR p.provider_merchant_id IS DISTINCT FROM p_merchant OR p.status NOT IN ('pending','captured') THEN RAISE EXCEPTION 'Payment context mismatch'; END IF;
  IF p.status='pending' AND (c.status NOT IN ('open','payment_pending') OR c.expires_at IS NULL OR c.expires_at<=now()) THEN RAISE EXCEPTION 'Checkout unavailable'; END IF;
  RETURN private.oddgrid_paypal_context(p.id);
 END IF;
 IF c.status NOT IN ('open','payment_pending') OR c.expires_at IS NULL OR c.expires_at<=now() OR NOT EXISTS(SELECT 1 FROM public.carts WHERE id=c.cart_id AND status='active') OR EXISTS(SELECT 1 FROM public.payments WHERE checkout_session_id=c.id AND provider='paypal' AND status IN ('pending','authorized','captured')) THEN RAISE EXCEPTION 'Checkout unavailable'; END IF;
 v_id:=private.create_payment_attempt(c.id,'paypal','immediate_capture',p_key);
 UPDATE public.payments SET provider_environment='sandbox',provider_merchant_id=p_merchant WHERE id=v_id;
 RETURN private.oddgrid_paypal_context(v_id);
END $$;
CREATE FUNCTION public.oddgrid_paypal_guest(p_payment uuid,p_guest_token uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v jsonb; BEGIN
 SELECT private.oddgrid_paypal_context(p.id) INTO v FROM public.payments p JOIN public.checkout_sessions c ON c.id=p.checkout_session_id JOIN public.carts a ON a.id=c.cart_id WHERE p.id=p_payment AND a.user_id IS NULL AND a.guest_token=p_guest_token AND p_guest_token IS NOT NULL;
 IF v IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF; RETURN v;
END $$;
CREATE FUNCTION public.oddgrid_paypal_find_order(p_order text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v jsonb; BEGIN
 SELECT private.oddgrid_paypal_context(id) INTO v FROM public.payments WHERE provider='paypal' AND provider_environment='sandbox' AND provider_reference=p_order;
 IF v IS NULL THEN RAISE EXCEPTION 'Unmapped provider order'; END IF; RETURN v;
END $$;
CREATE FUNCTION public.oddgrid_paypal_claim(p_payment uuid,p_guest_token uuid,p_operation text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.payments; c public.checkout_sessions;
BEGIN
 SELECT * INTO STRICT p FROM public.payments WHERE id=p_payment FOR UPDATE;
 PERFORM public.oddgrid_paypal_guest(p.id,p_guest_token);
 SELECT * INTO STRICT c FROM public.checkout_sessions WHERE id=p.checkout_session_id FOR UPDATE;
 PERFORM private.oddgrid_paypal_snapshots(c.id);
 IF p.status<>'pending' OR p.failure_code IS NOT NULL OR c.status NOT IN ('open','payment_pending') OR c.expires_at IS NULL OR c.expires_at<=now() OR NOT EXISTS(SELECT 1 FROM public.carts WHERE id=c.cart_id AND status='active') OR p.amount IS DISTINCT FROM c.total_amount OR p.currency IS DISTINCT FROM c.currency OR p_operation IS NULL OR p_operation NOT IN ('create','capture') OR (p_operation='create' AND p.provider_reference IS NOT NULL) OR (p_operation='capture' AND p.provider_reference IS NULL) THEN RAISE EXCEPTION 'Operation unavailable; reconcile'; END IF;
 UPDATE public.payments SET failure_code=CASE p_operation WHEN 'create' THEN 'PAYPAL_CREATE_STARTED' ELSE 'PAYPAL_CAPTURE_STARTED' END WHERE id=p.id;
END $$;
CREATE FUNCTION public.oddgrid_paypal_bind(p_payment uuid,p_order text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.payments; BEGIN
 SELECT * INTO STRICT p FROM public.payments WHERE id=p_payment FOR UPDATE;
 IF p.provider<>'paypal' OR p.provider_environment IS DISTINCT FROM 'sandbox' OR p.status<>'pending' OR p.failure_code IS DISTINCT FROM 'PAYPAL_CREATE_STARTED' OR p.provider_reference IS NOT NULL OR p_order IS NULL OR p_order !~ '^[A-Z0-9-]{1,64}$' THEN RAISE EXCEPTION 'Invalid order binding'; END IF;
 UPDATE public.payments SET provider_reference=p_order,failure_code=NULL WHERE id=p.id;
END $$;
CREATE FUNCTION public.oddgrid_paypal_complete(p_payment uuid,p_order text,p_capture text,p_merchant text,p_amount text,p_currency text,p_event_id text DEFAULT NULL,p_event jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.payments; v_order uuid; e private.payment_events;
BEGIN
 SELECT * INTO STRICT p FROM public.payments WHERE id=p_payment FOR UPDATE;
 PERFORM private.oddgrid_paypal_snapshots(p.checkout_session_id);
 IF p.provider<>'paypal' OR p.provider_environment IS DISTINCT FROM 'sandbox' OR p.provider_merchant_id IS DISTINCT FROM p_merchant OR p.flow<>'immediate_capture' OR p.provider_reference IS DISTINCT FROM p_order OR p_order IS NULL OR p.currency IS DISTINCT FROM p_currency OR p_currency IS DISTINCT FROM 'USD' OR p.amount::text IS DISTINCT FROM p_amount OR p_capture IS NULL OR p_capture !~ '^[A-Z0-9-]{1,64}$' OR (p.provider_payment_id IS NOT NULL AND p.provider_payment_id<>p_capture) OR p.status NOT IN ('pending','captured') THEN RAISE EXCEPTION 'Capture context mismatch'; END IF;
 IF (p_event_id IS NULL)<>(p_event IS NULL) THEN RAISE EXCEPTION 'Invalid event'; END IF;
 IF p_event_id IS NOT NULL THEN
  IF length(p_event_id) NOT BETWEEN 1 AND 128 OR p_event->>'id' IS DISTINCT FROM p_event_id OR p_event->>'event_type' IS DISTINCT FROM 'PAYMENT.CAPTURE.COMPLETED' OR p_event#>>'{resource,id}' IS DISTINCT FROM p_capture OR p_event#>>'{resource,status}' IS DISTINCT FROM 'COMPLETED' OR p_event#>>'{resource,amount,value}' IS DISTINCT FROM p_amount OR p_event#>>'{resource,amount,currency_code}' IS DISTINCT FROM p_currency OR p_event#>>'{resource,payee,merchant_id}' IS DISTINCT FROM p_merchant OR p_event#>>'{resource,supplementary_data,related_ids,order_id}' IS DISTINCT FROM p_order THEN RAISE EXCEPTION 'Event context mismatch'; END IF;
  PERFORM private.register_payment_event('paypal',p_event_id,p_capture,'PAYMENT.CAPTURE.COMPLETED',p_event);
  SELECT * INTO STRICT e FROM private.payment_events WHERE provider='paypal' AND provider_event_id=p_event_id FOR UPDATE;
  IF e.provider_payment_id IS DISTINCT FROM p_capture OR e.payload IS DISTINCT FROM p_event THEN RAISE EXCEPTION 'Event replay mismatch'; END IF;
 END IF;
 -- Atomic local completion; provider capture is outside this transaction.
 BEGIN
  UPDATE public.payments SET status='captured',provider_payment_id=p_capture,captured_at=coalesce(captured_at,now()),failure_code=NULL WHERE id=p.id;
  v_order:=private.finalize_order_from_payment(p.id);
  IF p_event_id IS NOT NULL THEN PERFORM private.mark_payment_event_processed('paypal',p_event_id,NULL); END IF;
 EXCEPTION WHEN OTHERS THEN
  IF p_event_id IS NOT NULL THEN PERFORM private.mark_payment_event_processed('paypal',p_event_id,'Reconciliation required'); END IF;
  UPDATE public.payments SET failure_code='PAYPAL_RECONCILE_REQUIRED' WHERE id=p.id;
  RETURN jsonb_build_object('status','retry','order_id',NULL);
 END;
 RETURN jsonb_build_object('status','captured','order_id',v_order);
END $$;
DO $$ DECLARE p record; r record; BEGIN
 FOR p IN SELECT oid::regprocedure AS sig FROM pg_proc WHERE pronamespace IN ('public'::regnamespace,'private'::regnamespace) AND proname LIKE 'oddgrid_paypal_%' LOOP
 EXECUTE format('ALTER FUNCTION %s OWNER TO postgres',p.sig);
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',p.sig);
 FOR r IN SELECT DISTINCT a.grantee,pg_get_userbyid(a.grantee) AS name FROM pg_proc f CROSS JOIN LATERAL aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a WHERE f.oid=p.sig::oid AND a.grantee NOT IN (0,'postgres'::regrole,'service_role'::regrole) LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',p.sig,r.name);
 END LOOP;
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',p.sig);
 END LOOP;
END $$;

COMMIT;
;

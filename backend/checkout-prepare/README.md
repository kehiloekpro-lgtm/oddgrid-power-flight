# Checkout preparation — staged, unavailable, no payments

Nothing in this directory was deployed or executed against Supabase. `index.ts`
always returns 503 for permitted POST requests: no environment switch can enable it.
The browser also has an independent closed gate (`CHECKOUT_CONTRACT_REVIEWED = false`)
and allows preparation only in development. Changing one flag is insufficient.

## Evidence and exact blockers

Inspected the saved October 19 `cart-api.zip` and `validate-cart.zip` source.
The verified guest mechanism queries `carts` with **both** `id = cart_id` and
`guest_token = guest_token`, then checks `status = active`. The saved source does
not expose or enforce a cart expiry field. The diagnostic validation endpoint
requires a secret and must never be called by the browser.

Read the October 14 function export `Pasted text(4).txt` in full. It supplies
`private.create_checkout_from_cart` and `private.finalize_order_from_payment`.
Checkout uses the parent price; both item snapshot INSERTs omit variant identity.
Retrieved prior project context also establishes `public.checkout_prepare_bridge`
returns a UUID and forwards the same 12 arguments to the private function. A later
October 19 private function revision is reported to add locks and total checks;
the October 14 body is therefore **not** a safe replacement for the current body.

Before writing an executable migration or binding the adapter, obtain:

1. Current complete definitions/overloads and ACLs of the bridge, checkout creation
   and finalization functions, including current locks and idempotency behaviour.
2. Exact DDL, indexes, constraints, generated columns, triggers and dependencies of
   carts, cart_items, products, product_variants, checkout_sessions, checkout_items
   and order_items. In particular: expiry policy; UUID key constraints; snapshot
   immutability; monetary precision; generated line totals; nullability and lengths
   of contact/shipping fields; any market-specific address requirements.
3. Current cart-write transaction/locking behaviour so checkout validation,
   currency checks and price snapshots cannot race a cart or catalogue update.

`inspect-contracts.sql` is a read-only metadata export for that evidence. It is
**not a migration** and was not executed. No executable schema changes are supplied
because the assignment requires inspecting actual constraints before preparing them.
The variant correction proposal is in `variant-pricing-proposal.md`.

## Code implemented

- `handler.ts`: bounded JSON request validation; CORS origin allowlist; generic
  unauthorized responses; required guest token and UUID idempotency key; normalized
  active/expiry checks; trusted-record variant eligibility preflight; minimal
  allowlisted server-confirmed session response. No raw diagnostics, PII or tokens
  are returned or logged. No payment or order operations.
- `pricing.ts`: server-only, exact integer-cent policy, grounded in cart-api's
  purchasing safeguards. Snapshot price is the variant price when selected; no
  fallback to the parent if the variant is invalid or unpriced. Quantity, direct
  sale, confirmed availability and parent/variant/cart currency checks apply.
  This preflight **does not fix SQL** and is never authoritative on its own.
- `index.ts`: intentionally unbound service adapter and closed activation gate.
  The handler's mockable interface is an integration seam, not new infrastructure.

The missing adapter must use service-role credentials **only inside the Edge
Function**, never browser imports. Verify both guest credentials against the
actual backend; normalize its confirmed expiry policy. Call the existing reviewed
bridge with the established arguments. Atomic authorization, validation, variant
pricing, idempotency and snapshot integrity must also be enforced by the database
transaction. A separate Edge preflight cannot establish those guarantees.

## Proposed HTTP envelope

`POST /functions/v1/checkout-prepare` JSON:
`cart_id`, `guest_token`, `idempotency_key`, and these contact/shipping fields:
`email`, `phone`, `shipping_recipient_name`, `shipping_phone`, `shipping_line1`,
`shipping_line2`, `shipping_city`, `shipping_region`, `shipping_postal_code`,
`shipping_country_code`.

These map to the saved function's `p_`-prefixed arguments (guest token is for
ownership verification, not an invented existing RPC argument). The browser
cannot supply prices, items, shipping charges, discounts or totals. The staged
form requires all fields except line2; this conservative policy is **pending
current DB/address-contract review**, not a statement of current DB nullability.
No contact information is sent with the gate closed.

Proposed success: `{checkout: {id, cart_id, currency, expires_at, subtotal,
shipping_amount, tax_amount, discount_amount, total_amount}, payment_initiated:false}`.
Amounts are decimal strings read back from the trusted database session, never
browser totals. The adapter must check session.cart_id before returning the row,
including when the UUID idempotency key already exists. Do not pass through a
payment URL or service-role response. The deployed 503 body remains supported.
The actual deployed endpoint does not currently implement this proposed success
contract.

## Browser integration

Development `/cart` links to `/checkout`, which restores the existing guest session,
shows names/configurations/quantities, and stages contact/shipping fields. It
stays unavailable with the prepare button and inputs disabled. Production shows
only the unavailable message and cart navigation. The request client accepts only
a minimal server-confirmed session, preserves an intent UUID across page refreshes
in session storage, blocks concurrent submissions and rejects stale-session
responses. It never automatically retries uncertain writes. Contact data is not
persisted; only SHA-256 intent digests and random UUIDs are stored. Intent UUIDs
are scoped to the guest credentials, cart composition and normalized contact data.
Existing cart and quotation flows are unchanged except for a credential accessor
and a development-only navigation link. Payments remain disabled.

## Verification and activation sequence

Tests use isolated fixtures only: no supplier records, payment methods or real
orders. Fake adapters test the boundary contract, **not actual SQL concurrency,
RLS, expiry or pricing enforcement**. The current private functions have not been
fixed by these tests.

1. Obtain the metadata above and current function bodies. Review expiry, address
   requirements, idempotency scope and snapshot deletion/retention policies.
2. Prepare a minimal additive migration from the current definitions. Review it,
   then apply only to an isolated development database with separate approval.
3. Exercise real SQL (including concurrent/replayed/cross-cart requests), snapshot
   variant identity and rollback paths; preserve historical rows and all ACLs.
   Verify eventual order-copy mapping using isolated database fixtures only,
   without invoking payment/order finalization in this assignment.
4. Bind the service-only adapter to the existing bridge and normalize readback of
   authoritative totals. Review CORS origins/rate limits and atomic guest expiry
   enforcement. Do not expose the service key or diagnostic endpoint.
5. Review the full diff and get explicit approval before any Edge deployment or
   database change. Deploy only to a development environment initially; verify
   guest A/B isolation and production still disabled. Enable the reviewed
   development gates only after those checks. Do not enable public purchasing,
   payment attempts, payment links or payment capture.

This is a partial integration blocked on current contracts, not a completed or
deployed correction. No production deployment is part of this sequence's current authorization.

## Results for this change

- `npm run build`: passed (local production build only).
- `npx tsc --noEmit`: passed after route generation.
- `npx tsc -p backend/checkout-prepare/tsconfig.json`: passed for staged server code.
- Targeted ESLint on changed TypeScript: passed.
- Full-project ESLint: 283 errors and 7 warnings; diagnostic signatures match the
  starting commit exactly (checked in an isolated archive of `2255640`).
- `node --test tests/*.test.mjs`: 46 passed, including existing homepage/cart tests.
- No live checkout, database migration, Edge deployment, payment test or order
  finalization was run. No browser end-to-end success is claimed.

# Minimal additive variant correction — review fragments, not executable migration

The actual current constraints/triggers and latest function bodies are missing.
Do not run these fragments against the project. Preserve the latest checkout
locking/integrity code; do not replace it with the older saved body.

## Additive snapshot fields

Propose nullable `variant_id uuid` and `variant_name text` on both existing
`checkout_items` and `order_items`. Retain historical NULL values; do not infer old
configurations from current cart or product data. Existing `product_sku` snapshots
should carry the selected variant SKU (including NULL if absent), otherwise the
parent SKU. Preserve existing parent product id/name/model/brand and quantity.
Review current SKU length constraints before copying. The variant name and SKU
remain immutable even if the catalogue variant is renamed later.

Choose foreign-key deletion behaviour only after current retention/immutability
constraints are known. Do not add cascade deletion, delete rows or backfill guessed
variant selections. A nullable identity snapshot without a new FK avoids silently
rewriting historical identity on catalogue deletion; final constraint choice
requires the actual dependent-object review.

## Price/eligibility expression inside the existing locked transaction

Using the known table/column names, the core projection is:

```sql
-- Fragment inside create_checkout_from_cart, after verified guest ownership,
-- active cart/expiry checks and existing cart/item/catalogue locks.
SELECT ci.product_id, ci.variant_id, ci.quantity,
       p.name AS product_name,
       v.variant_name,
       CASE WHEN ci.variant_id IS NOT NULL THEN v.sku ELSE p.sku END AS product_sku,
       CASE WHEN ci.variant_id IS NOT NULL THEN v.selling_price ELSE p.selling_price END AS unit_price
FROM public.cart_items ci
LEFT JOIN public.products p ON p.id = ci.product_id
LEFT JOIN public.product_variants v
  ON v.id = ci.variant_id AND v.product_id = ci.product_id
WHERE ci.cart_id = p_cart_id;
```

Reject the **entire** cart on any failed predicate; never silently drop an invalid
row with an inner join or let `SUM` ignore NULL prices:

- Product exists, status is active, sale_type is direct; quantity is a positive
  integer in the cart API's 1..100 range.
- Parent currency equals cart currency (both supported), even when a variant exists.
- With a variant: it exists, belongs to the product, is active, has
  `confirmed_available` availability and currency equal to parent/cart, and has a
  finite strictly positive price within the existing numeric precision.
- Without a variant: no product variants require a selection; parent availability
  is `confirmed_available` and parent price is finite/strictly positive.
- An invalid/unpriced variant must **never** fall back to a valid parent price.

The selected record supplies availability, price and SKU as in cart-api; parent
status, direct-sale eligibility and currency still apply. This is stricter than
an older checkout function accepting `available_to_order` and matches the current
cart purchasing safeguard requested for this change.

Compute subtotal and insert checkout items from the **same locked, validated
projection**, using exact database numeric arithmetic. Keep generated line_total
behaviour, totals precision, existing shipping/tax/discount policy and integrity
checks after inspecting their definitions. `pricing.ts` provides isolated test
vectors for this policy; it is not a replacement for SQL locks or snapshots.

## Idempotency and authorization

Authenticate both guest UUIDs and expiry using the existing verified backend
mechanism. That authorization must remain valid inside checkout creation, not
just in a separate service-role HTTP lookup. Preserve the current UUID idempotency
key, serialize duplicate preparations and scope replay to the authorized cart.
A global key lookup returning a different cart's session must fail without leaking
it. Define behaviour for a changed cart/contact intent or expired checkout before
binding the frontend; do not return a stale/foreign checkout as newly prepared.
Current unique indexes and locks must be inspected before choosing the SQL patch.

## Checkout-to-order copy (proposal only; never invoke finalization here)

In the **existing** finalization function's checkout_items -> order_items INSERT,
add `variant_id` and `variant_name` to the target list and copy
`ci.variant_id`, `ci.variant_name` in the SELECT. Continue copying the frozen
`product_sku`, price and quantity. Never reread the live product variant to price
or name an order. Preserve all payment-state checks, locks, totals, audit events
and idempotency. No payment/finalization call is added to checkout preparation.

A deployable migration cannot be safely produced until current function bodies,
actual constraints/generated expressions/triggers and expiry semantics are supplied.

# Secure checkout preparation — Phase 2, staged only

**No migration or Edge deployment to OddGrid has occurred. Checkout and payments
remain disabled.** The adapter and migration are executable review artifacts;
`index.ts` has `DEPLOYMENT_APPROVED = false`, and the browser's independent
`CHECKOUT_CONTRACT_REVIEWED` gate also remains false. Environment variables alone
cannot activate either entry point. The localhost-only CORS list is intentional.

## Authoritative source

`OddGrid_checkout_contract_export_2026-10-21(1).csv`, supplied in this assignment,
SHA256 `8d2d579acabeb388749bfc66a473fa922c1aa5064f4794a8e79b4f0c7a78838b`.
Read all exported function bodies, columns, constraints, indexes, triggers, RLS
metadata and dependencies. No older saved function body is used as the baseline.
`tests/export-fixture.sql` derives relevant schema and old functions from this
export; its auth helpers, enum values and non-exported support tables are isolated
test stubs, not a full Supabase clone. No real customer/supplier records are included.

## Migration

`migrations/20261021_001_secure_variant_checkout.sql` is one transaction. It:

- Guards the normalized exported function/locking-trigger bodies, old uniqueness,
  generated totals, privileged ACLs and enabled cart-write lock trigger. Drift
  aborts before schema changes. A successful migration is intentionally not rerunnable.
- Adds nullable `variant_id uuid` / `variant_name text` to both snapshot tables.
  Historical NULLs stay NULL. No backfill, cascade, table recreation or RLS change.
  Snapshot variant IDs have no new FK, preserving identity after catalogue deletion.
- Replaces `UNIQUE(checkout_session_id,product_id)` with two partial unique indexes:
  one base-product line per checkout/product; one selected variant per checkout.
  Multiple variants and an explicitly priced eligible base can coexist. A base
  line is not a guessed variant: it uses the parent's own confirmed price. This
  does not change the existing cart-api's configuration-selection behaviour.
- Adds required `p_guest_token uuid` as argument 13 to the private function and
  public bridge. Both remain postgres/service_role-only. Every guest call checks
  token possession inside the locked cart transaction before idempotency lookup.
  Registered carts still require auth.uid ownership or the existing staff exception.
- Retains legacy 12-argument signatures for dependencies/authenticated ownership,
  but routes them through the guarded function with NULL guest proof. They cannot
  prepare anonymous guest carts. The Edge adapter never forwards browser auth claims.
- Preserves parent/item locks, adds selected-variant locks and serializes a request
  UUID with a transaction advisory lock plus the existing unique idempotency index.
  The exported cart-write trigger serializes item writes on the same parent cart.
  Catalogue updates block on product/variant share locks. The validated JSONB
  projection supplies both the exact numeric subtotal and snapshot inserts.
- Rejects wrong-product/inactive/unconfirmed/unpriced variants, RFQ/inactive parents,
  invalid quantities (1..100), NaN/nonpositive prices and parent/variant/cart currency
  mismatches. Selected variant pricing never falls back to the parent price.
- Checks contact-required fields from actual NOT NULL columns; phones, line2,
  region and postal code remain optional. Keeps zero shipping/tax/discount policy,
  generated line_total columns and 30-minute checkout expiry. Carts have no expiry
  field or fabricated lifetime. Only a checkout session expires by timestamp.
- Checks replay ownership/currency/contact/cart composition/session expiry/snapshot integrity.
  An unchanged, still-eligible replay returns the original frozen price, not a newly
  priced checkout; changed intent needs a new UUID. Cross-cart UUID reuse fails.
- Changes only the order-item projection in finalization: copy variant ID/name and
  the already selected SKU/quantity/frozen price. Every existing payment-state check,
  lock, total check, idempotency guard, status update and audit event is preserved.
  The tests compare the complete function body apart from these added copy columns.
  Finalization is never called in this assignment.

### Lock failure semantics

The existing cart-item UPDATE path can acquire a tuple lock before its BEFORE
trigger acquires the cart lock; checkout preserves the exported parent/item lock
order. A conflicting operation can therefore be chosen as a PostgreSQL deadlock
victim. Transactions roll back atomically; neither adapter nor browser retries a
write automatically. On 40P01/40001/timeout, confirmation fails generically; an
explicit retry uses the same intent UUID. This is a safe rejected request, not a
claim that all concurrent operations succeed. Same-cart duplicates serialize;
cross-cart duplicate keys serialize and fail without exposing the other session.

## Edge adapter and HTTP boundary

`adapter.ts` uses server-only fetch to existing PostgREST tables and the corrected
`checkout_prepare_bridge` RPC; no new client dependency or backend is introduced.
Server configuration is `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Never use
VITE_* for the service key or import this module into browser code.

Preflight checks both guest UUIDs with `user_id IS NULL`, reads real cart/product/
variant records, and lets the existing handler validate eligibility. The database
repeats ownership, status, pricing and idempotency checks atomically, so preflight
is not the authorization boundary. Only 13 explicit p_* fields reach the RPC.
Readback rechecks the token and filters checkout ID, cart ID and idempotency key.
Only authorized ID, currency, expiry and database monetary values are returned;
SQLSTATE 42501/22023 map to generic 404/409, other failures to generic 503. No raw
SQL diagnostics, guest tokens, service keys, payment URLs or customer addresses
are returned. No automatic retries; requests have timeouts and no-store caching.

POST JSON: `cart_id`, `guest_token`, `idempotency_key`, `email`, `phone`,
`shipping_recipient_name`, `shipping_phone`, `shipping_line1`, `shipping_line2`,
`shipping_city`, `shipping_region`, `shipping_postal_code`, `shipping_country_code`.
No browser items, prices or totals. Optional text fields are sent as NULL to SQL.
The form does not treat browser catalogue-availability flags as authoritative:
variant details may be unavailable under public RLS, while the service adapter
can validate the authorized cart. The server rejects ineligible records. The
independent approval gate keeps all current submissions disabled.

Success: `{checkout:{id,cart_id,currency,expires_at,subtotal,shipping_amount,
tax_amount,discount_amount,total_amount},payment_initiated:false}`.
Amounts are decimal strings formatted from database values, never browser totals.
The deployed 503 response remains supported. Guest carts require no login.

## Isolated verification

No normal PostgreSQL server, psql, Docker or local Supabase instance is available
in this environment. An optional PGlite runtime was installed **outside the repo**
for in-memory PostgreSQL verification. It cannot connect to the deployed project.
No project dependency or lockfile changed.

Reproduce from the repository root:

```sh
npm install --prefix /tmp/oddgrid-sql-runtime --no-package-lock --ignore-scripts @electric-sql/pglite@0.5.10
node backend/checkout-prepare/tests/run-isolated.mjs /tmp/oddgrid-sql-runtime/node_modules/@electric-sql/pglite/dist/index.js
node --test tests/*.test.mjs
npx tsc --noEmit
npx tsc -p backend/checkout-prepare/tsconfig.json
npm run build
```

The runner loads a fresh guarded metadata-derived fixture, a historical snapshot,
the actual migration and rollback-contained SQL assertions. It checks auth/legacy
bypasses, registered-owner/staff paths, mixed base/variant lines, pricing/eligibility,
uniqueness, replay/currency/quantity/expiry failures, historical/generated columns,
frozen order-copy projection and snapshot totals. No payment or public order rows
are created; no finalization is invoked. SQLSTATE checks distinguish expected
rejections from accidental SQL errors. It also compares finalization bodies byte
for byte except the two variant-copy additions.

**Limits:** embedded PostgreSQL has one connection; mock adapter tests and these
SQL tests do not prove multi-session concurrency, real Supabase gateway/RLS behaviour
or production-scale lock duration. `tests/checkout-concurrency.spec` supplies seven
PostgreSQL isolationtester schedules for later execution on a dedicated local
`oddgrid_checkout_isolated` database. They cover concurrent same-key retry,
variant-price updates before/after snapshot locks, cart edits and cross-cart key
reuse. Those schedules are prepared, not executed here. Fresh-database fixture
refuses to run over an existing catalogue. Never load the fixture on OddGrid.


On ordinary local PostgreSQL, load the guarded fixture with the explicit opt-in
and then the migration, using a dedicated empty database. For concurrency only,
use PostgreSQL's test binary (not a storefront dependency):

```sh
isolationtester "host=127.0.0.1 dbname=oddgrid_checkout_isolated" < backend/checkout-prepare/tests/checkout-concurrency.spec
```

The binary takes a libpq connection string, not a `--dbname` option. Use local
credentials only. Expected outcomes are annotated in the spec; review blocking,
SQLSTATE rejections and teardown assertions before deployment approval.

## Controlled deployment procedure — later approval required

1. Keep both code gates false and the deployed endpoint returning 503. Obtain
   explicit authorization for a **development database** migration, not production.
   Back up that environment's schema/data/function ACLs and inventory callers of
   the legacy signatures. Capture current metadata using inspect-contracts.sql;
   compare with the supplied export, including dependencies and locking triggers.
2. Reproduce SQL checks in a fresh isolated database (fixture is test-only). Execute
   the isolationtester schedules on ordinary local PostgreSQL and review waits,
   expected 22023 rejections and rollback behaviour, including the tuple/parent lock-inversion schedule. Check platform/PostgREST
   compatibility and existing RLS with real Supabase development credentials.
3. Against the separately approved development project, apply **only** the migration:
   `psql "$APPROVED_DEV_DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/checkout-prepare/migrations/20261021_001_secure_variant_checkout.sql`.
   Do not load fixture/test data on OddGrid or run finalization/payment functions.
   Check new columns/indexes, generated expressions, both RPC signatures, service-only
   grants, original RLS, and finalization diff. Verify the PostgREST schema-cache reload for the new overload (the migration emits a transactional NOTIFY), and record migration checksum/version.
4. Review adapter/CORS origins and gateway verify_jwt behaviour for public-key
   guest requests, consistent with the existing cart API. Configure service credentials
   only on the Edge server. Obtain explicit Edge deployment approval separately.
   Initially deploy the **still-disabled** entry point to development and verify
   OPTIONS/CORS/503 without checkout writes. No Netlify build/deployment is authorized.
5. Only after separate approval, enable preparation in an isolated/development
   environment, test guest A/B separation, key replay, expiry and database readback
   without any payment/order actions. Then review enabling the browser development
   gate. Production checkout/public purchasing and all payment providers remain disabled.

Failure before COMMIT rolls back the migration. After a committed change, keep the
Edge gate closed and use a reviewed forward fix; do not automatically restore the
old tokenless implementation or drop snapshot columns containing new history.
Production migration/deployment is a separate explicit authorization and review.

## Verification recorded for Phase 2

- Local frontend build: passed.
- Frontend TypeScript and staged backend TypeScript checks: passed.
- Targeted ESLint on all changed TypeScript: passed.
- Existing and extended JavaScript suites: **56 passed**.
- Actual migration and SQL assertions in isolated PGlite/PostgreSQL: passed,
  including service-role execution, owner/staff checks, legacy-signature denial,
  generated/historical snapshots, currency replay rejection and full finalization
  body comparison. No payment or order-finalization function was invoked.
- Seven multi-session schedules: supplied, not executed (no ordinary local server).
- Actual Supabase/PostgREST/RLS integration: not executed. OddGrid migration not
  applied; Edge not deployed; browser/Edge gates remain disabled.

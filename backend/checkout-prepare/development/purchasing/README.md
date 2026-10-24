# Development purchasing implementation — 24 October 2026

This package stages Development purchasing only. No hosted writes, deployments,
payments, original Phase 5 reruns or evidence changes are authorized by its existence.
Production profile protection was applied separately and remains outside this package.

## Current hosted facts (read-only checks)

Development `ogbnpvroaafgpnlxeftw`: zero Auth users/products/carts/checkout sessions;
variant-aware 13-argument checkout bridge exists and browser execution is denied;
legacy 12-argument bridge is restricted; profile UPDATE is allowed only on first_name,
last_name and phone for authenticated customers. Service roles retain role management.
Only migration history entry is `20261023120135 protect_profile_role_least_privilege_20261023`.
No Edge Functions are deployed. Variant SELECT grants exist but no variant RLS policy.

Integration branch remote HEAD was `d953a212f020830fce03a163898db54bb330a736` when work began.
New work is isolated on `implementation/development-purchasing`; do not merge or deploy
it automatically. Existing production checkout entry and browser contract stay disabled.

## Implemented paths

- Product detail loads public variant names/SKUs/prices and requires selection when
  customer-visible options exist. Variant lookup failures disable Add to Cart.
- Selected variant UUID travels to the existing cart API. No price is submitted.
- Variant eligibility checks product ownership, activation, currency and availability.
- Project-specific Development session-storage key avoids sharing Production carts.
- Development checkout uses the existing form, adapter, RPC and idempotency contracts.
- Staged cart handler preserves the inspected deployed cart action contract. It removes
  raw diagnostics, bounds JSON, requires exact CORS origins, excludes user-owned carts,
  validates parent availability and quantity-update eligibility, and uses compare-and-set
  when adding to an existing quantity. A collision fails without automatic retry.
- Database checkout locking remains authoritative. This does not prove cross-session
  cart concurrency; no hosted concurrency tests were run.
- Separate Development entry points reject Production URLs and Production origins,
  require an explicit server approval flag and application-key header, and never expose
  service-role credentials. OPTIONS is handled before guest credentials.
- The ordinary Production entry point remains deliberately disabled.
- No unrelated photograph is substituted for a missing product image.

An empty public variant list cannot prove no hidden configurations exist. The server
still enforces configuration requirements; a rejected add must never fall back to a
parent price. No supplier stock or commercial pricing is implied by fixtures.

## Local verification and browser reproduction (Codespace/cloud, no Windows installs)

Install existing repository dependencies with `npm ci`. Install optional isolated tools
outside this repository, e.g. a private scratch folder:

```bash
npm install --prefix /tmp/oddgrid-local-tests --no-audit --no-fund @electric-sql/pglite@0.3.14 playwright@1.62.1
node /tmp/oddgrid-local-tests/node_modules/playwright/cli.js install chromium
node --test tests/*.test.mjs
python3 -m unittest discover -s backend/checkout-prepare/development/tests
python3 backend/checkout-prepare/development/purchasing/test_history_plan.py
node tests/purchasing-integration.mjs /tmp/oddgrid-local-tests/node_modules/@electric-sql/pglite/dist/index.js
```

Start the preview in another terminal (a dummy key is used only because the browser
runner intercepts ALL Supabase traffic):

```bash
VITE_ODDGRID_DEVELOPMENT_SUPABASE_URL=https://ogbnpvroaafgpnlxeftw.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=isolated-public-test-key npm run dev -- --host 127.0.0.1 --port 5173
node tests/purchasing-browser.mjs /tmp/oddgrid-local-tests/node_modules/@electric-sql/pglite/dist/index.js /tmp/oddgrid-local-tests/node_modules/playwright/index.mjs
```

The runner uses real isolated PostgreSQL, actual migration SQL, staged cart/checkout
handlers, and the actual checkout REST adapter. Its tiny in-process REST transport is
not hosted PostgREST. Metadata-derived fixtures contain Auth/payment support stubs;
this is not full Supabase Auth verification. It denies unexpected Production requests
and does not call any payment/finalization RPC. No fixture database survives shutdown.
The browser runner covers 1280px/390px, variant selection, add, quantity change, reload
persistence, shipping form, authoritative total, removal, empty state, keyboard focus
and horizontal overflow. It also checks a disabled checkout response before an explicit retry. It is not a comprehensive screen-reader accessibility audit.

## Approval sequence — do not execute yet

### 1. History reconciliation only

Use the original private `execution.json`, `expected.json` and unchanged schema bundle
in the existing Codespace. Preserve their checksums and original Phase 5 failure evidence.
`prepare_history.py` never connects; it creates a private, guarded SQL plan only:

```bash
python3 backend/checkout-prepare/development/purchasing/prepare_history.py --reviewed-commit <EXACT_NEW_REVIEWED_COMMIT>
```

It requires the exact clean implementation branch. Its plan checks the complete expected
post-checkout/post-profile-security catalogue, browser effective permissions, empty
application/Auth tables, and exact existing history entry. It INSERTs history version
`20261021000100 secure_variant_checkout` with the original SQL stored as text, **without
executing that SQL again**. Original SQL SHA-256 must remain
`87a0aa1b344f6820703af1b3fea6e35b50f8e4dce9339ba7ec0e915cb1dc583d`.
The private plan is not a CLI migration and must never be committed.

After separate approval, execution must use existing `database_setup.endpoint()` with
`development=True`, exact project `ogbnpvroaafgpnlxeftw`, Session Pooler port 5432 and
username `postgres.ogbnpvroaafgpnlxeftw`. Use ONLY existing Development URL/password
Codespaces secrets. SQL alone cannot identify a Supabase project: an independently
verified connection is mandatory. Reject original project/credentials.
Run the guarded SQL once with existing `database_setup.psql(..., readonly=False)`;
no automatic retry. Independently reconnect read-only; compare catalogue and exact
new history row, original evidence, Auth/application counts and managed fingerprint.

### 2. Variant visibility policy

Separately approve the unchanged reviewed file
`backend/checkout-prepare/production/variant-read-policy-review.sql`, **Development only**
despite its historical directory name. It changes one SELECT policy, no grants or data.
Its SHA-256 is `0c09b91662f1d5308897a46e12ff71bd8dc1f473b4ba7deb310f6d64b42b408a`.
Read-only precheck must confirm RLS, grants, no pre-existing variant policies and expected
catalogue after history reconciliation. Execute once; inspect exact policy definition,
effective anon/authenticated visibility and unchanged write permissions independently.

### 3. Explicitly synthetic Development fixtures

Separately approve `fixtures.sql`: one named synthetic product and two variants only.
No Auth user, profile, cart or checkout is seeded. Verify the exact empty Development
baseline and fixture SQL checksum before execution. Capture inserted UUIDs privately.
Cart and checkout records created later through browser tests require their own approved
scope. Never copy fixtures into Production. No automatic reset or broad cleanup.

### 4. Development Edge deployment and hosted browser writes

Separate approval must name ONLY Development and these entry points:

- `cart-api`: `backend/development/cart-index.ts` plus cart handler/config/pricing imports.
- `checkout-prepare`: `backend/development/checkout-index.ts` plus existing adapter,
  handler/pricing/contract/config imports.

Bundle/import paths must be verified using the official Edge bundler in the approved
cloud environment before deployment; Node TypeScript checks are not Deno deployment proof.
Guest routes require `verify_jwt=false` because no signed-in user JWT is sent. Each entry
checks application key itself and independently validates the guest cart/token. The key
is not customer authorization. Use existing built-in server-only service-role key and:

- `ODDGRID_DEVELOPMENT_PURCHASING_APPROVED=ogbnpvroaafgpnlxeftw`
- `ODDGRID_DEVELOPMENT_PUBLISHABLE_KEY`: Development public key, securely configured.
- `ODDGRID_DEVELOPMENT_ORIGINS`: exact approved localhost/private preview origin(s),
  comma-separated; no wildcard, path or Production storefront origin.

Do not change `backend/checkout-prepare/index.ts`, Production secrets or deployments.
Use the Development public key in the local preview. Do not publish a frontend yet.
Approve hosted browser creation/update/removal of synthetic carts and checkout sessions
only after database and Edge verification. Record every created cart/checkout UUID;
zero payment/order calls permitted. Verify quantities, exact selected UUID/SKU and
server-returned totals, expiry, duplicate submissions and two independent guest sessions.

### Failure handling and recovery

Any SQL failure rolls back its transaction. Any ambiguous SQL/deployment outcome stops
the sequence. Investigate read-only; never replay, reset, delete receipts or restore
Production. Preserve private before/after catalogues and receipts. A successfully seeded
fixture is intentional persistent test data; cleanup requires reviewed UUID-scoped SQL
and a separate approval, accounting for dependent checkout snapshots.

## Payment preparation boundaries

`backend/payments/paypal-sandbox-verification.ts` stages a provider-signature verification
boundary and pure capture reconciliation checks, tested only with mocked HTTP. It never
creates, captures or finalizes anything. Customer approval creation, OAuth secret binding,
webhook deployment, provider order/merchant mapping, database event idempotency and
notification delivery are still NOT IMPLEMENTED as an end-to-end customer flow. Existing
restricted database functions and Sandbox diagnostics are preserved. Duplicate-event,
refund and fulfilment integration remain separate work; do not treat a matching pure
predicate or mocked signature reply as a verified payment.

Provider references used for the staged mock verifier:
https://developer.paypal.com/api/rest/webhooks/rest/
https://supabase.com/docs/guides/functions/auth-headers

# Phase 4: approval checkpoint (2026-10-23)

The hosted baseline was restored and independently verified in Phase 3. Do not
restore it again. This phase has performed hosted **read-only** inspection only.
The hosted rehearsal and permanent migration are not yet authorized/executed.

## Exact inputs and readiness

- Branch: `integration/supabase-demo-product`; restoration commit `b50e9ce7354208e3e1ce1d47d57fa0522a70f4da`.
- Development only: `ogbnpvroaafgpnlxeftw`. Original `izixhjstwfgywbgrnrey` is never a write target.
- Unchanged private schema SHA-256: `88f212dc644104e7a7b3a7c256badb8a35ecc4baa7a4d27a00d57d5006bb0354`.
- Unchanged migration: `backend/checkout-prepare/migrations/20261021_001_secure_variant_checkout.sql`.
- Migration SHA-256: `87a0aa1b344f6820703af1b3fea6e35b50f8e4dce9339ba7ec0e915cb1dc583d`.

Read-only Development inspection matched all four migration body guards:
checkout creation `96f5a3d30e7db98e4f49dde69acef18b`, bridge
`bc35620e779c0ab0f245077ab49f9fe6`, finalization
`6f9ed92cfcf660c7490214bafbc45ae5`, cart-write locking
`faf47ac7ba3aead5080bd9abb13012a5`. Existing signatures, empty search paths,
security-definer flags, postgres ownership and restricted RPC ACLs match.
The product-only checkout uniqueness constraint and generated line totals match;
variant snapshot columns remain absent. No migration change was needed.

## Reused workflow and corrections

`cloud/codespace_rehearse.py` reuses the reviewed commit/clean branch/private
bundle checks and `database_setup.py rehearse`. It does not expose restoration,
permanent migration or payment operations. Default invocation verifies the
baseline **read-only**; `--execute` additionally needs `rehearse:ogbnpvroaafgpnlxeftw`.

The existing workflow now pins rehearsal to Development and the reviewed manifest,
checks the exact baseline before any fixture writes, and rechecks it under locks.
One outer transaction obtains application table locks in deterministic name order,
then checks all application tables are empty. Locks use a 5-second timeout;
statements use a 60-second timeout and the client uses ON_ERROR_STOP. Existing
writers either finish before the empty check or wait until rollback. This is a
safety boundary, not proof of checkout concurrency.

The workflow reuses `tests/before-migration.sql`, the unchanged migration and
`tests/checkout.sql`, stripping only their outer transaction statements. The only
outer end statement is ROLLBACK. Afterwards, fresh read-only connections verify
the original catalogue/ACLs, empty application records and unchanged managed
object fingerprint. Any error stops; no retry/reset/cleanup writes run automatically.

## Fixture effects and side effects

Synthetic products, variants, carts, checkout snapshots and a historical checkout
are created only inside the rollback transaction. An explicit synthetic UUID is
inserted into `auth.users`, firing the real reviewed `public.handle_new_user()`
profile-insert hook. The UUID is not an existing customer selected by the test;
a collision aborts rather than updating that user. Profiles and the auth row roll
back. Direct SQL does not call the Auth signup service or send signup email.

Inspected row hooks update timestamps or local product-cost rows. There are no
additional auth-users row hooks. Inspected managed event hooks perform local DDL
or transactional PostgREST notifications; extension-install hooks are not exercised.
The migration's NOTIFY and managed DDL notifications are discarded on rollback.
No HTTP calls, extension installation, sequence nextval/setval invocation, Auth API
calls, payment creation, finalization or fulfilment are part of this workflow.
Order-copy coverage uses a temporary table with generated totals, never a real
order. The finalization function definition is replaced transactionally but never
invoked. Fixture constraint removal uses a savepoint and rolls back inside the
outer transaction; existing RLS and managed permissions are never disabled.

## Tests and limits

- Python safety/wrapper tests: 47 passed.
- Existing Edge/checkout tests: 35 passed; entry point remains disabled.
- Embedded PostgreSQL migration and catalog/rehearsal runners: passed.
- Actual unchanged private baseline in disposable PostgreSQL 17.6, Docker network
  disabled, non-superuser postgres: migration and extended checkout suite passed;
  schema/ACL rollback, auth/profile cleanup and managed stand-ins verified.
- First disposable rehearsal exposed missing service_role membership in the local
  stand-in. Hosted postgres's SET permission was confirmed read-only; only that
  disposable stand-in was corrected. The subsequent isolated run passed.
- Targeted ESLint, Python compilation and whitespace checks passed.
- TypeScript (`npx tsc --noEmit`) and local frontend build passed. Build retained
  existing third-party directive/tsconfig plugin warnings; nothing was deployed.

Coverage includes base and selected-variant prices; base plus multiple variants;
UUID/name/SKU/quantity snapshots; wrong/missing tokens and foreign carts; legacy
bypass rejection; invalid/missing/inactive/unavailable/unpriced/NaN variants;
parent/variant/cart currencies; quantity zero and above 100; empty/inactive carts;
repeated and foreign-cart keys; changed composition; frozen old prices and new
authoritative base/variant prices; expired checkout sessions; tampered totals;
historical NULL variant snapshots; generated totals; all legacy/new RPC overloads
restricted for PUBLIC/anon/authenticated; service_role access; no payments/orders.

Gaps: no multi-session concurrency claim; no payment or real order execution;
staff override test is deliberately skipped on hosted Supabase rather than
replacing the real helper; real Auth services/managed extensions are not completely
reproduced in isolated PostgreSQL. Authenticated ownership uses SQL JWT settings,
not an end-to-end signed JWT/Edge request. Historical order rows and every possible
cart mutation are not exhaustively fixture-tested. Hosted execution is pending.

## Exact next operation — approval required

Use the final full commit hash supplied with this review, on a clean integration
branch in the existing Codespace. Existing Development-only Codespaces secrets
provide the verified Session Pooler URL and password; neither appears in argv.
The private bundle stays unchanged in `~/oddgrid-schema-private`.

```sh
# Read-only readiness; permitted before approval:
python3 backend/checkout-prepare/development/cloud/codespace_rehearse.py --reviewed-commit REVIEWED_FULL_COMMIT

# Only after explicit hosted rollback-rehearsal approval:
python3 backend/checkout-prepare/development/cloud/codespace_rehearse.py --reviewed-commit REVIEWED_FULL_COMMIT --execute --approval rehearse:ogbnpvroaafgpnlxeftw
```

Expected result: migration/tests execute then roll back, followed by independent
baseline/empty-record/managed-state verification. New overloads/variant columns,
fixtures and modified definitions must not persist. On failure/ambiguous outcome,
stop and investigate read-only; do not retry or permanently migrate. A later
permanent Development migration needs a different, separately approved operation.
Checkout, Edge deployment, payments, production storefront and original project
changes remain excluded.

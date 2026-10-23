# Phase 5 — Development checkout test approval checkpoint

Historical review for commit 13dcbf6. The hosted run failed; do not reuse its
authorization. See [current launch handover](../LAUNCH_READINESS.md) for later
Development security changes, runtime findings and remaining verification gaps.

Target: `ogbnpvroaafgpnlxeftw` only. Original `izixhjstwfgywbgrnrey` is never a write target.
No hosted test writes have been authorized by this preparation assignment.

## Evidence and prerequisites

Continue from migration commit `0477c1c14e39dbfee8cf6cd05018ca217ce710cf`.
Keep the unchanged original private migration evidence in
`~/oddgrid-migration-private/execution.json`; do not edit it to match the new test commit.
The wrapper binds that evidence to its original migration commit and independently
checks the current clean integration branch against the supplied test commit.

- Baseline SHA-256: `88f212dc644104e7a7b3a7c256badb8a35ecc4baa7a4d27a00d57d5006bb0354`
- Migration SHA-256: `87a0aa1b344f6820703af1b3fea6e35b50f8e4dce9339ba7ec0e915cb1dc583d`
- Expected migrated catalogue: `a3b60b61908845e4183d584d92dbb03139a825f09d8c39cdfe1ffc0011f12f3d`

Use the existing Codespace and Development-only passwordless Session Pooler secret
on port 5432 plus its separate password secret. Never put credentials in command
arguments, chat or Git. Child Docker container receives only allowlisted PG*
variables, not the original project's secrets. Keep Development idle: no Auth
signups, dashboard edits, background workers or application traffic during tests.
Application tables must be empty and there must be no real Auth users.

Read-only hosted inspection on 2026-10-23 confirmed PostgreSQL 17.11, the
`pg_isolation_test_session_is_blocked(integer,integer[])` observer and permission
to execute it. Existing postgres role can SET ROLE authenticated/service_role.
The exact managed/auth fingerprints, application functions, ACLs, RLS and schema
are reverified by the wrapper before any test write; populated/drifted state fails.

## Real authorization finding — unresolved

`private.is_staff_or_admin()` reads `public.profiles.role IN ('staff','admin')`
for `auth.uid()`. It is SECURITY DEFINER with an empty search_path.
`public.is_oddgrid_admin()` separately checks `public.admin_users` membership.
Neither helper is replaced or relaxed by this procedure.

Hosted read-only checks found authenticated UPDATE on `profiles.role`, an
own-profile UPDATE policy checking only user identity, and no role-protection
trigger (only set_updated_at). The isolated characterization attempts that exact
own-profile UPDATE under authenticated, with a synthetic subject. This succeeded in isolated PostgreSQL using the restored real helper and RLS;
the staff helper recognized the self-assigned role. This is an existing
authorization gap, NOT a security pass. No hosted roles or policies are repaired
by this assignment. Correct it under a separate reviewed change before enabling
customer-facing access. Checkout RPCs themselves remain inaccessible to browser
roles; the gap also matters to RLS policies using the staff helper.

Database-role/JWT-setting simulation is not proof of signed JWT verification,
PostgREST behaviour, Auth service behaviour, or network Edge authorization.

## Coverage

| Area | Prepared operation | Evidence / limit |
|---|---|---|
| Base/variant prices, currencies, quantities, eligibility | Existing checkout.sql reused after migration | Transaction rolled back; no migration rerun |
| Multiple variants/base line, duplicates, frozen totals | Existing suite and final schedule invariants | Includes checkout-to-temporary-order projection; no order finalization |
| Guest ownership, missing/wrong token, foreign cart/key | Existing suite + wrong_guest and cross_cart_key schedules | Cross-cart reuse rejected; no foreign checkout returned |
| Real customer/staff/admin helper rules | tests/real_staff.sql inserted into existing suite | Real profile roles and helper; auth trigger runs in rolled-back transaction |
| Customer self-promotion | Explicit known-gap characterization | Failure of desired authorization isolation; not labelled secure |
| Same key concurrent prepare | same_key | Must block and produce exactly one checkout |
| Different keys same cart | different_keys | Current contract permits two complete sessions; no claim of one session per cart |
| Price changes both directions | price_before / price_after | Frozen unit price 400 or 300 according to committed lock ordering |
| Quantity changes both directions | quantity_before / quantity_after | Quantity 3 incorporated, or frozen 2 with changed-cart retry rejection |
| Availability changes both directions | availability_before / availability_after | Reject ineligible first, or preserve previously frozen snapshot |
| Insert and removal races | insert_before / insert_after / delete_after | Incorporate committed base line or preserve complete existing snapshot |
| Snapshot integrity | Each schedule teardown asserts only | Exact counts, subtotal=sum(lines), selected identity, price, quantity, no duplicate line |
| Unexpected error / process failure | Unit failure injection and exclusive intent | No automatic cleanup/retry on mismatch; exit zero alone never passes |
| Deliberate tuple/parent deadlock | Existing spec retained, seventh schedule excluded | Requires separate deterministic victim/abort review; not proven here |

The six deterministic original permutations are reused. Additional permutations
extend the same specification through `phase5_plan.py`. Each case selects only
its steps, uses boolean results instead of random UUID output, and replaces the
local database guard with the established exact Development environment guard.
The hosted adapter's teardown is read-only assertions; deletion occurs only after
an exact reviewed synthetic transcript match and explicit invariant checks.

## Cloud runtime and isolated verification

The existing pinned official PostgreSQL 17.6 image already contains
`/usr/lib/postgresql/17/lib/pgxs/src/test/isolation/isolationtester`.
No Windows tools, new cloud service, package build or paid infrastructure is
required. Hosted execution runs that binary in a read-only, non-root Docker
container with no capabilities, through the verified Development Session Pooler.
Network host mode is required for the outbound database connection; the isolated
driver instead uses docker exec against a network-disabled disposable database.

Reproduce preparation tests entirely in Codespaces:

```sh
python3 -m unittest discover -s backend/checkout-prepare/development/tests -q
node --test tests/checkout-prepare.test.mjs
python3 backend/checkout-prepare/development/tests/run_restore_isolated.py --phase5
```

The isolated driver reuses the actual private baseline and unchanged migration,
then invokes real PostgreSQL sessions. Its Auth/managed extension stand-ins are
not a complete Supabase installation. New golden output can only be generated
through its explicitly isolated `--generate-phase5-expected` mode; the hosted
wrapper has no such option. Review any changed transcripts before committing.

Isolated results (2026-10-23): 68 Python checks and 35 existing checkout/Edge
tests passed. The existing functional suite, real-helper characterization and all
13 multi-session schedules passed in disposable PostgreSQL; exact transcript
replay is also required before the final approval checkpoint. Hosted concurrency
has not run. No build/type-check rerun was needed for these backend Python/SQL-only
changes. Python compilation and whitespace checks passed.

## Exact separately approved operation

Replace REVIEWED_TEST_COMMIT with the final full commit reported with this review.
First run read-only readiness:

```sh
python3 backend/checkout-prepare/development/cloud/codespace_test_checkout.py --reviewed-commit REVIEWED_TEST_COMMIT
```

Only after explicit approval for hosted synthetic writes and normal cleanup:

```sh
python3 backend/checkout-prepare/development/cloud/codespace_test_checkout.py --reviewed-commit REVIEWED_TEST_COMMIT --execute --approval test-checkout:ogbnpvroaafgpnlxeftw
```

Independent completion check (fresh read-only connections):

```sh
python3 backend/checkout-prepare/development/cloud/codespace_test_checkout.py --reviewed-commit REVIEWED_TEST_COMMIT --verify-only
```

## Expected effects and failure recovery

1. Exclusive private `phase5-execution.json` intent is created before the first
   fixture write. It records project, test and migration commits, hashes and
   managed/auth/sequence pre-state. It is never silently removed or overwritten
   to permit a retry. The original migration receipt and export remain unchanged.
2. Functional tests lock application tables, insert only synthetic fixtures,
   exercise the real auth.users profile trigger and real role rules, then ROLLBACK.
   No Auth API signup/email, payment call or public order creation is involved.
   Fresh read-only verification proves empty application tables and unchanged
   catalogue/managed/auth/sequence state before proceeding.
3. Thirteen independent multi-session schedules commit synthetic fixtures:
   one product, one selected variant, two guest carts, their items, and zero to
   two checkout sessions and snapshots. They do not create auth identities.
   These active synthetic products exist briefly in DEVELOPMENT only. Never
   point a storefront at Development while these tests run.
4. Each schedule checks frozen totals and identity. The runner also checks exact
   expected ERROR messages, observed blocking, exit status, stderr and its entire
   golden transcript. After success only, one scoped transaction deletes checkout
   items/sessions, cart items/carts, variant and product using exact fixture IDs.
   It asserts all application tables empty before COMMIT, and rolls back cleanup
   on failure. A new empty-state/schema check precedes the next schedule.
5. Private per-case transcripts and completion evidence remain outside Git.
   After the final cleanup, fresh connections verify exact definitions/ACLs/RLS,
   auth hook, managed state, auth count, sequence values and empty app tables.

On unexpected SQL output, deadlock, timeout, connection ambiguity, assertion or
verification failure: STOP. No automatic retry, truncation, reset, role changes,
session termination or recovery delete is authorized. Pending transactions are
bounded by statement/lock/idle-in-transaction timeouts; connection termination
rolls back only their uncommitted transactions. Committed fixtures may remain.
Keep the private intent and traces. Inspect pg_stat_activity and read-only row
inventory for the exact a1/a2/a3/a4/a5 fixture UUIDs listed in phase5_plan.py.
Compare catalogue and managed fingerprints. Prepare a narrowly scoped cleanup
transaction for separately approved recovery only after determining what committed.
Do not delete unrelated rows, clear evidence, or blindly rerun the test wrapper.

Supabase migration-history reconciliation remains pending. This testing operation
does not use db push, replay the migration, or create a Supabase migration-history
entry. Retain the existing Git/hash/execution evidence for a future reviewed
history-only reconciliation. Checkout Edge deployment, payments, fulfilment,
production changes and original-project writes remain outside approval.

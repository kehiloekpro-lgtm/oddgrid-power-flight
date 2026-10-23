# OddGrid technical launch handover — 2026-10-23

**NO-GO for real orders.** This is an engineering evidence checkpoint, not an
approval to deploy or activate checkout. No hosted data, grants, functions,
history entries or Edge deployments were changed during this mission.

## Provenance and project isolation

Connected Supabase project inventory confirmed:

- Development: `ogbnpvroaafgpnlxeftw`, OddGrid Development, PostgreSQL 17.11.
- Production/original: `izixhjstwfgywbgrnrey`, OddGrid, PostgreSQL 17.6.
- Starting integration HEAD reconfirmed: `91087ccaf06fc41e56f293b305793e7c164f934f`.
- Original Phase 5 authorization stays bound to `13dcbf60b0d9e200a96d00dd35d364e07b4a6391`.
- Migration execution stays bound to `0477c1c14e39dbfee8cf6cd05018ca217ce710cf`.

The original Codespace was accessible. Its clean HEAD was still the original
Phase 5 commit when receipts were inspected and its original `--verify-only`
command ran. That verification failed. Only afterward was repository code pulled
forward for NEW READ-ONLY audits. No newer commit was substituted for test-write
authorization, and no original tests were rerun on a hosted database.

## Project status matrix

| Component | State | Evidence | Missing work / risk | Next action |
|---|---|---|---|---|
| Connections and identities | VERIFIED | Connected inventory, repository endpoint | Keep credentials segregated | Use exact project guards |
| Original Phase 5 completion | FAILED | Private receipt contains functional rollback stage only; all 13 transcripts missing | Cannot certify any hosted concurrency schedule | Preserve receipt; new runner needs review and approval |
| Current Development fixture absence | VERIFIED | Read-only counts: auth, products, variants, carts, items, checkout, payments, orders all zero | Original receipt does not document subsequent recovery cleanup | Preserve original evidence; do not infer successful teardown |
| Development variant migration | VERIFIED structural checks | Four snapshot columns; token-aware and legacy signatures; browser RPC execution denied | Managed fingerprint and migration history require separate reconciliation | Run current read-only diagnostic audit |
| Development role correction | VERIFIED grant checks / isolated regression | authenticated cannot UPDATE(role); can edit allowed personal fields; security migration history present | No new signed-JWT/PostgREST write test was authorized | Review actual endpoint regression separately |
| Production role correction | FAILED security prerequisite | authenticated still has UPDATE(role) with identity-only own-profile policy | Customer role escalation remains a Production launch blocker | Review populated-profile grant correction proposal |
| Variant customer visibility | FAILED | Both projects: RLS enabled and SELECT grant, but zero variant SELECT policies | Frontend cannot retrieve configurations through normal browser role | Review narrow eligible-variant read-policy proposal |
| Public catalogue | BLOCKED for purchasing | Production has three products, zero eligible active/direct/confirmed products | No approved real products for end-to-end buying | Test isolated fixtures; never publish fake stock/prices |
| Homepage/category/detail data on branch | VERIFIED mocked paths | Existing catalogue tests; Supabase-backed implementation | Live deployment is older | Separate deployment review after backend readiness |
| Live storefront | VERIFIED as demo, FAILED as purchasing storefront | Browser inspection of https://oddgrid.co.za/ | Hardcoded demo products/prices, unavailable cart flow, unsupported delivery claims | Do not represent it as order-ready |
| Guest cart logic | VERIFIED isolated/mock tests; hosted E2E NOT TESTED | Existing cart API deployed in Production; regression tests | Development has no deployed cart API | Version/control and approve a Development deployment first |
| Checkout Edge adapter | VERIFIED mocked contract; hosted BLOCKED | Staged adapter tests; entry gate false; Development Edge list empty | Production deployed handler still returns 503 | Controlled Development-only deployment after DB verification |
| Checkout browser flow | BLOCKED intentionally | CHECKOUT_CONTRACT_REVIEWED=false | No real server-confirmed session UX test | Local/mock preview then approved Development test |
| Payments | NOT TESTED end to end | Inspected diagnostic source uses Sandbox host, Sandbox environment and diagnostic-key guard | Diagnostics are not customer payment integration | Obtain/review provider adapter and webhook contract; separate Sandbox authorization |
| Webhooks and finalization | NOT TESTED end to end | Restricted DB functions exist; no verified customer webhook adapter identified in inspected deployed functions/repo | Signature, amount, currency, replay and recovery evidence absent | Implement against actual provider contract, test isolated first |
| Confirmations/admin order operations | NOT TESTED / BLOCKED | admin-preview is a product preview, not order operations | No verified customer/merchant notification delivery or operational order dashboard | Define and implement after payment contract review |
| Refund/cancel/fulfilment | NOT TESTED | Existing DB infrastructure preserved | Provider integration and exception workflows not verified | Separate reviewed implementation; no paid test orders here |
| Build and TypeScript | VERIFIED locally | Current build and TypeScript checks pass | Not proof of deployed revision | Retain exact commit/build provenance |
| Full lint | FAILED | Existing repository-wide formatting errors/warnings | Changed files are targeted-lint checked | Separate formatting cleanup; avoid conflating lint and runtime correctness |
| Mobile/accessibility | NOT TESTED comprehensively | Responsive source retained; desktop live page inspected | No device/keyboard/screen-reader suite completed | Review local preview across breakpoints before deployment |
| Backups/PITR/recovery | BLOCKED / NOT VERIFIED | Available connector does not expose backup evidence used for this mission | No verified restore point or restore drill | Obtain dashboard/management backup evidence before Production writes |
| Countries, shipping, tax, warranty | BLOCKED essential configuration | Checkout currently uses zero shipping/tax/discount; USD/ZAR DB support | Zero-rate test policy is not an approved commercial policy | Configure essential rules before activation; defer broader negotiations |

## Original private evidence — retained, not rewritten

The authoritative path is derived by `migration_plan.folder()` from repository
code: `Path.home() / 'oddgrid-migration-private'`. In the inspected Codespace it
resolved to `/home/vscode/oddgrid-migration-private`.

Observed original receipts:

- `execution.json` SHA-256:
  `62c5ea034fe900007ebd1cfbd14947b2baaf9c81237060434e6c8fb133b8a75b`
- `phase5-execution.json` SHA-256:
  `6e32dfb72dc53873741a8347632f471463ed3a85cea46a9872268ca3c9ec10a1`
- Phase 5 completed stages: `functional rollback and fresh verification` only.
- `phase5-<case>.txt`: none present. Expected transcripts exist in Git, but an
  expected transcript is not evidence that its corresponding hosted test passed.

Historical checkout catalogue, export and receipt remain unchanged:

- Baseline: `88f212dc644104e7a7b3a7c256badb8a35ecc4baa7a4d27a00d57d5006bb0354`.
- Checkout SQL: `87a0aa1b344f6820703af1b3fea6e35b50f8e4dce9339ba7ec0e915cb1dc583d`.
- Expected checkout-only catalogue: `a3b60b61908845e4183d584d92dbb03139a825f09d8c39cdfe1ffc0011f12f3d`.

All original hosted concurrency families remain unverified: same key, price before
and after, quantity before and after, cross-cart key, different keys, availability
before and after, insert before and after, delete after and wrong guest. The
original first schedule stalled. The original functional suite completed before
the role correction; newer denied-promotion assertions are not retroactively
covered by that original receipt.

## Diagnosed concurrency runtime incompatibility

A new Development READ-ONLY libpq connection showed:

```text
transport_pid_matches_server = false
statement_timeout = 2min
lock_timeout = 0
idle_timeout = 0
transaction_read_only = on
```

The requested startup options were 20s/15s/30s. PostgreSQL REL_17_6
`src/test/isolation/isolationtester.c` uses `PQbackendPID()` to supply server-side
`pg_isolation_test_session_is_blocked` calls. Supavisor's transport key differs
from the server PID, making that stock observer incompatible with this route.
The unhonoured startup timeouts also undermine the intended bounds. These are
observed runtime defects; the missing timed-out transcript cannot be reconstructed.

New `phase5_plan.runtime_guard` rejects this route BEFORE intent creation or fixture
writes. It does not change expected transcripts or weaken assertions. New hosted
tests need a reviewed server-PID-aware driver or a proven compatible connection,
SQL-level effective timeout checks, continuous private partial-output retention
and a NEW operation-bound approval. Do not clear the old intent or retry 13dcbf6.

## Reproducible read-only operations

Use FINAL_REVIEWED_COMMIT from the completion report. These commands do not
restore, migrate, clean up, run fixtures, call payments or deploy anything:

```sh
python3 backend/checkout-prepare/development/cloud/codespace_launch_audit.py --reviewed-commit FINAL_REVIEWED_COMMIT
python3 backend/checkout-prepare/development/cloud/codespace_pooler_probe.py --reviewed-commit FINAL_REVIEWED_COMMIT
```

The launch audit compares the historical catalogue with ONLY the two reviewed
profile table-UPDATE revokes. It independently checks all effective profile column
privileges because historical catalog.sql does not capture attacl. It compares
managed/auth/sequence state against the original migration receipt, and reports
differences rather than accepting a new hosted snapshot as authoritative. A
current-state pass never implies original Phase 5 completion.

Do not run the original verifier with a newer commit merely to satisfy HEAD.
The original command was executed on the actual clean original commit and failed.
Subsequent security/history changes can legitimately invalidate its old catalogue;
that does not authorize changing its receipt or claiming concurrency passed.

## Implemented safe preparation and tests

- Read-only evidence/column privilege audit and libpq PID/timeout probe.
- Fail-fast runtime guard, preserving original assertions and evidence.
- Isolated driver now applies the actual role correction in its disposable copy
  before testing new denied-promotion assertions. The historical expectation is
  not overwritten. No hosted rehearsal or fixture retry was performed.
- Actual security migration tested in isolated PostgreSQL; own allowed edits,
  forbidden role/id/timestamp updates, foreign-profile denial, trusted provisioning,
  helper preservation and rollback checked.
- `production/profile-permissions-review.sql`: proposal preserving nonempty
  profiles with transactional data-integrity checks. Isolated injected verification
  failure tests rollback of both permissions and retained rows. Not applied hosted.
- `production/variant-read-policy-review.sql`: proposal allowing SELECT only for
  active, confirmed, finite positive-priced variants of active/direct/confirmed
  products in the same currency. No browser writes. Isolated negative exposure
  cases cover draft, RFQ, inactive, unavailable, unpriced, NaN, currency mismatch
  and missing parent. Not applied hosted.
- Local Development endpoint opt-in: only `import.meta.env.DEV` plus exact
  `VITE_ODDGRID_DEVELOPMENT_SUPABASE_URL=https://ogbnpvroaafgpnlxeftw.supabase.co`.
  Use a Development publishable key. Production builds reject endpoint overrides;
  normal default remains Production. Checkout approval gates remain false.
- Homepage branch copy no longer asserts unverified local stock, 24-hour dispatch,
  installation or universal warranty backing. No live storefront was changed.

## Controlled Production deployment package — NOT approved

1. Record exact release commit, source SQL hashes, live deployment revision and
   maintenance window. Verify backup/PITR status and perform a recovery drill on a
   separate approved target. No satisfactory backup evidence was obtained here.
2. Complete Development verification using a repaired runtime and newly approved
   synthetic operation; verify cleanup independently. Add approved eligible-variant
   policy only after reviewing its exposure and updating the expected catalogue.
3. Reconcile Development history. Only `20261023120135` was observed in the database;
   checkout `20261021000100` exists in Git and in live definitions but not history.
   A history-only repair needs separate review; never replay its SQL to fix history.
4. Audit Production users, table/column grants and current function hashes against
   reviewed artifacts without exporting PII. Production currently has one Auth user,
   three products and five carts; checkout/order/payment counts were zero.
5. Review `production/profile-permissions-review.sql` for Production's nonempty
   profile table. The original Development security migration REJECTS nonempty
   profiles and must not be copied blindly. Do not downgrade actual staff or reset
   users. Bind the future execution wrapper to exact Production ref and approval.
6. Review the unchanged checkout migration against current Production hash guards,
   locks, existing carts, generated columns and historical data. Do not use the
   Development-only wrapper against Production. Never restore the schema baseline.
7. Review the variant SELECT policy, expected catalogue/column privileges and RLS
   diff. Each permission expansion requires explicit approval and negative tests.
8. Request explicit approval for each exact Production database/history change,
   with backup status, expected effects, read-only postchecks and forward recovery.
   SQL errors roll back. Ambiguous outcome stops; no replay or broad UPDATE rollback.
9. Version and deploy only approved Edge artifacts. Development currently has no
   Edge Functions; inspected Production checkout remains disabled. Establish cart,
   checkout, Sandbox payment, verified webhook and notification contracts in
   Development before proposing their Production counterparts.
10. Verify provider callbacks against authoritative amount/currency/session IDs,
    invalid signatures, duplicates, out-of-order events, cancellation and failures.
    Existing DB finalization is privileged; never mark an order paid or bypass
    provider verification. This mission did not execute payment/finalization calls.
11. Approve essential shipping/tax/currency/country, supplier availability and refund
    settings. Zero shipping/tax in the current checkout function is a test policy.
    Confirm real prices and photographs; no demonstration catalogue import.
12. Review frontend release diff, mobile/accessibility, contact/legal information,
    CORS origins and env keys. Production must not use the Development opt-in.
    Obtain separate frontend deployment and checkout/payment activation approvals.
13. Post-deploy read-only checks and separately approved controlled validation must
    confirm release/backend consistency before taking real orders. Keep a kill
    switch and operational monitoring/merchant support procedures.

No exact write command is presented as ready: backups, a compatible concurrency
runtime, current-state reconciliation, provider integration and release provenance
are unresolved. The review SQL files are staged proposals, not automatically
discovered Supabase migrations or evidence of approval.

## Prioritized next executable work

1. P0 technical: Production role protection (proposal tested, not deployed).
2. P0 technical: reconcile managed/history differences and replace incompatible
   hosted concurrency observer without weakening tests; preserve old receipts.
3. P0 technical: approve/test variant visibility and Development Edge deployment.
4. P0 technical: provider Sandbox/webhook/finalization and failure-recovery contract
   plus customer/merchant notification and administrative order evidence.
5. P1 technical: browser E2E, mobile/accessibility, lint cleanup and release provenance.
6. Essential commercial configuration: approved products, delivery/shipping/taxes,
   refunds/warranties and supported destinations. Broader supplier/marketing work
   remains deferred.

Every new hosted write/test, history repair, Production deployment and checkout
activation needs a distinct reviewed operation and explicit approval. Nothing in
this handover grants that authorization.

# Reviewed Development-only baseline restoration

Status: code and isolated tests only. Neither hosted project has been written.
Human approval is still required before the first hosted write. This operation
restores the PRE-MIGRATION baseline only; it does not run checkout migrations,
checkout/payment functions, Edge deployments, Netlify builds or live checkout.

## Bound inputs

- Source: `izixhjstwfgywbgrnrey`, original remains read-only.
- Only allowed restoration target: `ogbnpvroaafgpnlxeftw`.
- Original private bundle: `~/oddgrid-schema-private/`; never re-export/substitute.
- Schema SHA-256: `88f212dc644104e7a7b3a7c256badb8a35ecc4baa7a4d27a00d57d5006bb0354`.
- Canonical manifest-content SHA-256: `92195846e4a2d427253cdf57cfa04481cdacfcbc1b2913a900b9489306416ff9`.
  Computed over JSON with sorted keys and separators `(',', ':')`; binds ALL
  metadata and the managed-attachment checksum, independently of schema bytes.
- Managed attachment SHA-256: `848c48a70831c1ec13c786d036117a892553448c8f70ec0216fcd9924d073468`.
- Export contains 28 application tables, 13 functions, 14 enums, two sequences,
  125 constraints, 102 indexes, 21 application triggers and 48 RLS policies.
  All 28 tables have RLS. Exact security-definer flags, empty search paths,
  body/definition hashes, generated expressions, owners and ACLs are compared.

## Corrections and security boundaries

`restore_plan.py` assembles SQL in memory from the unchanged reviewed dump.
It never executes SQL itself or rewrites the private baseline files.

1. Require the existing `public` schema owner and ACL to already equal source;
   preserve that schema and omit its redundant CREATE/OWNER/COMMENT/GRANT DDL.
   All application relations and functions must be postgres-owned.
2. Require all non-postgres default ACLs to equal the reviewed source, scoped
   exclusively to `supabase_admin/public`. Omit the 12 redundant dump statements
   for those defaults: postgres cannot act as Supabase's internal administrator.
   A mismatch fails; no role-membership/ownership workaround is performed.
3. Temporarily clear only postgres-owned public defaults for tables, sequences
   and functions. The dump replays its own source postgres defaults. Before
   verification, remove ambient function EXECUTE grants to PUBLIC and every
   non-owner role, then replay exact source function ACLs (including deliberate
   PUBLIC grants and grant options). No extra application access is invented.
4. Source and target read-only inspection confirmed anon/authenticated have no
   inherited roles, superuser or bypass-RLS rights. Execution preflight rejects
   any such elevation; the in-transaction managed snapshot detects concurrent
   membership/role changes. The existing intended source PUBLIC function grants
   remain intact; restricted checkout/payment routines remain restricted.
5. Restore `public.profiles` and `public.handle_new_user()` first. Attach only the
   exact reviewed `on_auth_user_created` trigger to existing `auth.users` last.
   Reject collisions or unreviewed hooks/policies/modes. CREATE TRIGGER enables
   the ordinary trigger by default, so do NOT issue owner-only ALTER TABLE on
   the managed auth table. Post-restore inventory verifies its exact definition.
6. One BEGIN/COMMIT transaction with transaction advisory lock, fresh-target
   check, pre/post managed-object fingerprint, exact application catalogue/ACL
   check and empty-record check. Client ON_ERROR_STOP/timeout disconnect rolls
   back failures. Catalogue comparisons ignore only OUTER inventory row order;
   nested column order, enum labels, function hashes and constraint values remain
   exact. No constraint or permission checks are disabled to pass a restore.

The managed fingerprint covers pre-existing schemas (including public), managed
relations/columns, routines, constraints, indexes, policies, triggers, extensions,
roles/memberships and non-postgres/global defaults. The new reviewed hook and
internal triggers created by the application's auth foreign keys are the only
expected managed-trigger additions excluded from that unchanged-state fingerprint.
No auth/customer/order/payment records are imported.

## Executed verification

42 Python tests passed, plus Python compilation and diff whitespace checks.
`tests/run_restore_isolated.py` restored the ACTUAL private dump in the pinned
PostgreSQL 17.6 image with `--network none`, no published ports and tmpfs data.
It used a NOSUPERUSER postgres role, managed-role defaults, auth stand-ins and an
unrelated auth-trigger sentinel. The disposable container was removed afterward.

Passed actual SQL checks:

- Application DDL dependency order; all catalogue comparison categories match.
- Injected RLS mismatch aborts, rolls back all application DDL, ACLs and hook.
- Repeated restore fails without changing verified baseline.
- All 26 anon/authenticated effective EXECUTE checks match source.
- Actual restored auth hook creates a synthetic profile inside a rolled-back
  isolated transaction; unrelated managed auth trigger remains unchanged.
- Application tables empty afterward; no checkout, payment-attempt or
  order-finalization function invoked; no checkout migration executed.

Limits: this is PostgreSQL with auth stand-ins, NOT the complete Supabase Auth
service. Supabase Vault is unavailable in that image; extension compatibility
metadata is supplied to the isolated builder fixture, while all actual application
DDL still executes. Both hosted extension inventories previously matched under
read-only inspection. Hosted service behaviour, pooler connectivity, concurrent
hosted DDL and actual hosted restoration remain unexecuted. The exact catalogue
and managed-state checks run again INSIDE the eventual hosted transaction.

## Secure operator prerequisites

In GitHub Codespaces secrets scoped to this repository, configure:

- `ODDGRID_DEV_DATABASE_URL`: Development dashboard passwordless direct URL
  (`postgres` user) or session-pooler URL (`postgres.ogbnpvroaafgpnlxeftw` user),
  database `/postgres`, port 5432, no password/query/fragment.
- `ODDGRID_DEV_DB_PASSWORD`: DEVELOPMENT database password only.

Neither was present in the current Codespace at review time. Do not paste values
in chat, source files, command arguments, diagnostics or Git. Refresh the existing
Codespace environment after adding secrets. The source secrets are not reused.
Child processes scrub ambient PG redirects/source passwords/API tokens and use
only the validated Development endpoint, TLS and the server-only DB password.
No service-role key, CLI linking or Supabase access token is needed for restoration.

Set `REVIEWED_COMMIT` to the FULL final commit in the delivery report after private
review, and pull ONLY the integration branch. Preserve a private copy of the bundle
before any later Codespace deletion; this procedure does not publish artifacts.

## Exact approved operation (DO NOT EXECUTE BEFORE APPROVAL)

Run in the existing Codespace, not on the user's Windows/phone environment:

```sh
git pull --ff-only origin integration/supabase-demo-product
# Set to the full reviewed commit from the delivery report:
REVIEWED_COMMIT='FULL_REVIEWED_COMMIT_FROM_DELIVERY'

# Local-only readiness check: verifies commit/branch, bundle and secret presence.
python3 backend/checkout-prepare/development/cloud/codespace_restore.py \
  --reviewed-commit "$REVIEWED_COMMIT"

# FIRST HOSTED WRITE: only after explicit human approval for this exact operation.
python3 backend/checkout-prepare/development/cloud/codespace_restore.py \
  --reviewed-commit "$REVIEWED_COMMIT" --execute \
  --approval restore:ogbnpvroaafgpnlxeftw

# Independent read-only comparison after success (or after an ambiguous timeout):
python3 backend/checkout-prepare/development/cloud/codespace_restore.py \
  --reviewed-commit "$REVIEWED_COMMIT" --verify-only
```

The wrapper pins exact target, baseline/manifest, clean branch and reviewed HEAD;
without --execute it does not connect to a database. Endpoint routing verifies
project identity through exact dashboard host/user/port; DB preflight additionally
requires the expected postgres/auth/roles environment. It does not claim a guessed
server GUC independently identifies a Supabase project. Missing credentials or
mismatched state terminate before any write. No approval is inferred from flags:
the operator must have explicit human authorization before --execute.

Expected changes ONLY in Development: baseline application tables/types/functions,
constraints/indexes/triggers/RLS/ACLs/sequences plus the one auth hook; zero imported
application rows. Supabase-managed object definitions/permissions stay unchanged.
Checkout migration and all storefront/payment activation remain separate.

## Failure/recovery

Do not blindly retry or delete target objects. ON_ERROR_STOP and a single DDL
transaction roll back errors; closing a timed-out client rolls back an uncommitted
transaction. A connection loss after COMMIT may leave success ambiguous. First
perform the read-only --verify-only operation and fresh target inventory. If the
baseline matches, do not restore again. If the target is still empty and managed
fingerprint unchanged, diagnose the sanitized failure before an authorized retry.
Unexpected partial/drifted objects require investigation and a separate recovery
plan, never an automatic DROP/reset or broader privileges. Keep source and bundle
untouched; do not execute checkout migrations as a recovery action.

> Current permanent-migration checkpoint: [PERMANENT_MIGRATION_REVIEW.md](PERMANENT_MIGRATION_REVIEW.md).
> The hosted rollback-only rehearsal has since passed, including independent
> post-rollback checks. Permanent hosted migration is still unexecuted and needs
> separate approval. Use the dedicated wrapper; historical generic commands below
> are superseded by the current review.
>
> Prior Phase 4 checkpoint: [REHEARSAL_REVIEW.md](REHEARSAL_REVIEW.md).
> The baseline has since been restored and independently verified on Development.
> Historical setup notes below do not authorize another restoration. Hosted
> rehearsal and permanent migration still require separate approval.
>
> Prior restoration instructions: [RESTORATION_REVIEW.md](RESTORATION_REVIEW.md).
> The exact private schema export has now passed isolated PostgreSQL restoration
> tests with the permission corrections and reviewed auth attachment. Hosted
> restoration is NOT authorized or executed. The earlier preparation notes below
> describe the prior generic workflow; the pinned Development wrapper and current
> review supersede its managed-trigger blocker and restore permission handling.

# Phase 3: schema-only development initialization

For the browser-only, integration-branch route prepared on 2026-10-22, see
[cloud/CODESPACES.md](cloud/CODESPACES.md). The manual Actions alternative is in
[cloud/README.md](cloud/README.md). Both projects are now accessible through the
Supabase integration; Development is `ogbnpvroaafgpnlxeftw`. The earlier local
operator commands below remain available, but Windows installations are not
required for the cloud export route. No hosted write approval is implied.

Prepared for source `izixhjstwfgywbgrnrey`, branch
`integration/supabase-demo-product`, starting commit `eafa8a3`.
**No hosted write operation has been executed.** Read-only integration checks
on 2026-10-22 verified Development `ogbnpvroaafgpnlxeftw`. Database credentials
and an authentic current schema dump remain unavailable.
No baseline has been fabricated. The prior SQL metadata fixture is test material,
**not a development initialization script**.

## Tools and source of truth

Use Python 3, `psql` and Docker on a trusted Linux cloud/operator machine.
The current export uses standard PostgreSQL `pg_dump --schema-only` from an
immutable official PostgreSQL 17.6 client image. It no longer runs `supabase init`,
`supabase link` or `supabase db dump`. The pinned CLI link requested revealed
project API keys; that was incompatible with the intended least-privilege PAT.
Do not broaden that token or retrieve service-role keys to fix export access.

Only the existing source database password is required, supplied through secure
Codespaces/Actions secrets (or hidden prompts for a direct local operator).
No password, URI or access token is placed in Docker argv or diagnostics.
The validated PG connection environment is forwarded by **variable name**,
including `PGSSLMODE=require` and read-only `PGOPTIONS`. The image runs only
`pg_dump`, never its database-server entry point. Explicit `--schema` selections,
`--schema-only` and `--strict-names` retain user definitions, ownership, ACLs,
RLS, constraints, indexes and sequences without rows/sequence values or roles.
The managed-auth attachment remains a separate reviewed export. No Supabase
Management API or API-key endpoint is called by the current export path.

See [cloud/CODESPACES.md](cloud/CODESPACES.md) for the existing-workspace recovery
commands and exact pinned image. Each export writes a sanitized stage report to
`~/oddgrid-export-status.json` (outside the bundle), which survives partial-export
cleanup. It contains only stage/status/category codes and a successful checksum.
No raw tool output, credentials, connection string or function body is recorded.
Actual exports stay private and outside Git. No restore/write phase is authorized.

References: [PostgreSQL 17 pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html)
and [Supabase restore guidance](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).

## 1. Read-only source export and development check

Run from the repository root. These variables contain **no password**. Get the
actual development reference from that project's dashboard; its display name is
not its reference. Use the Connect dialog's direct or **session** pooler URL,
remove the password, and retain `/postgres`. Session pooler port 5432 supports
IPv4; direct connections may require IPv6. Transaction pooler port 6543 is rejected.

```sh
SCRIPT=backend/checkout-prepare/development/database_setup.py
BUNDLE="$HOME/oddgrid-schema-private"
read -r -p 'Actual OddGrid Development project reference: ' DEV_REF
read -r -p 'Passwordless SOURCE database URL: ' SOURCE_URL
read -r -p 'Passwordless DEVELOPMENT database URL: ' DEV_URL
python3 "$SCRIPT" plan
python3 "$SCRIPT" export --source-url "$SOURCE_URL" --bundle "$BUNDLE"
python3 "$SCRIPT" check-dev --dev-ref "$DEV_REF" --dev-url "$DEV_URL"
```

Accepted endpoint shapes (substitute actual dashboard values):
`postgresql://postgres@db.PROJECT_REF.supabase.co:5432/postgres` or
`postgresql://postgres.PROJECT_REF@aws-REGION.pooler.supabase.com:5432/postgres`.
The script rejects the original reference for every development action, requires
an exact reference/host or reference/pooler-user match, rejects credentials/query
parameters in URLs and clears inherited `PG*` connection redirection settings.
It connects using TLS and checks database `postgres`, role `postgres`, managed
`auth.users`, `auth.uid()` and `service_role`. Project identity is bound to the
dashboard endpoint and pooler username, **not** an invented database project-ID
column. Confirm both endpoint/reference pairs in the dashboard independently.

The inventory identifies additional user-managed schema candidates. If present,
review and repeat the export with e.g. `--schemas public,private,custom_schema`
and a new bundle directory. Pass the same schema list on every later action.
Do not include Supabase-managed schemas in the baseline dump.

## 2. Compatibility review before ANY development write

Review `schema.sql` and `manifest.json` privately. The manifest inventories tables,
columns/generated expressions, constraints, indexes, triggers, functions (body
hashes/security-definer/search paths/ACLs), RLS policies, default privileges,
schema ownership/ACLs, role names, extensions and managed-schema customizations.
The raw dump preserves full SQL definitions, types, grants and ownership emitted
by pg_dump. It contains no data or login-role/password export.

Required checks, with no automatic hosted changes:

- Match source PostgreSQL major version where possible. Older target major
  versions are rejected. Review any newer-version ACL/syntax differences.
- Read-only checks on 2026-10-22 found matching installed extension names,
  versions and schemas in both projects. Recheck before restoration. Any later
  extension change needs separate development-only approval; the restore gate
  rejects mismatches. Current Supabase policy can ignore explicit version
  clauses; do not force a downgrade or remove the compatibility gate.
- Supabase supplies `auth`/`storage` and platform roles in the new project; this
  does **not** supply OddGrid tables. Review source role names/owners/grantees;
  any missing custom roles need a separately reviewed, least-privilege role
  setup. Do not copy role passwords or invent role permissions.
- Review cross-schema references and all non-default managed-schema objects.
  `managed_custom_triggers` contains custom trigger definitions attached to
  auth/storage/realtime; `managed_policies` flags policies there. The pinned
  restore now accepts ONLY the exact reviewed auth-users hook with no managed
  policies, restores it after application dependencies, and verifies managed
  objects remain unchanged. Other customizations still fail closed. See the
  current restoration review; never recreate/dump platform tables wholesale.
- Check external callbacks, HTTP/database-link functions, event triggers and
  scheduled jobs. Disable or omit source integrations through a reviewed
  development-only compatibility change; never copy secret records. Rehearsal
  inserts one synthetic `auth.users` identity and can fire real custom hooks.
  Do not run it until those hooks are reviewed as isolated from production.
- Verify the dump contains no record inserts/COPY, passwords, service keys or
  embedded credentials. Global/external DDL, top-level non-DDL and arbitrary psql
  commands are rejected. Automatic scanning is not proof of absence of secrets.

The current builder preserves existing matching managed schema/default ACLs,
replays exact application permissions and attaches the reviewed auth hook inside
one verified transaction. It never edits the original dump. See the current
review for the precise adaptations, tests, limits and approved-command template.

```sh
# After private review, bind later commands to these exact exported bytes:
BASELINE_SHA=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["schema_sha256"])' "$BUNDLE/manifest.json")
# Safe preview: no connection and no write.
python3 "$SCRIPT" restore --dev-ref "$DEV_REF" --dev-url "$DEV_URL" \
  --bundle "$BUNDLE" --reviewed-sha256 "$BASELINE_SHA"
```

## 3. Exact commands for the NEXT approved development-only test

**Not authorized for execution by this assignment.** After separate approval for
baseline restoration, run the following. `--approval` is an operation-bound
operator acknowledgement; it does not replace the required human authorization.
No script can prevent an operator from intentionally providing that flag.

```sh
python3 "$SCRIPT" restore --dev-ref "$DEV_REF" --dev-url "$DEV_URL" \
  --bundle "$BUNDLE" --reviewed-sha256 "$BASELINE_SHA" \
  --execute --approval "restore:$DEV_REF"
```

Restore refuses existing user tables/views/functions/types in selected schemas;
it does not overwrite a populated application or treat missing tables as normal.
It runs one transaction with `ON_ERROR_STOP`, then verifies structure and ACLs.
No migration or test data is included in baseline restoration.

After separate approval for the rollback rehearsal:

```sh
python3 "$SCRIPT" rehearse --dev-ref "$DEV_REF" --dev-url "$DEV_URL" \
  --bundle "$BUNDLE" --reviewed-sha256 "$BASELINE_SHA" \
  --execute --approval "rehearse:$DEV_REF"
```

This requires an exact, empty pre-migration baseline. It reuses, in **one outer
transaction**, `tests/before-migration.sql`, the existing migration
`migrations/20261021_001_secure_variant_checkout.sql` and `tests/checkout.sql`.
It rolls back migration and synthetic records on success; any failure aborts
and disconnect rolls back. Generated expressions, historical NULL snapshots,
base/variant prices, multiple variants, base+variant coexistence, ownership,
legacy bypass prevention, cross-cart/repeated idempotency, currency, quantity,
status/availability and EXECUTE grants are checked by the existing SQL suite.
Order-copy verification uses temporary snapshots and definition checks: it does
not call payment creation or finalization and never inserts a real order.

The fixture-only staff assertion is explicitly skipped on Supabase; no production
staff helper is replaced. A real staff-role integration test needs a separately
approved development staff identity/role fixture based on the actual helper.
Actual managed-auth triggers or additional NOT NULL constraints may require a
reviewed fixture compatibility adjustment. A failure is a blocker, not permission
to weaken constraints or substitute the simplified local fixture.

Only after review of successful rehearsal and separate migration approval:

```sh
python3 "$SCRIPT" apply-migration --dev-ref "$DEV_REF" --dev-url "$DEV_URL" \
  --bundle "$BUNDLE" --reviewed-sha256 "$BASELINE_SHA" \
  --execute --approval "apply-migration:$DEV_REF"
```

This executes the unchanged, source-hash-guarded migration on development, using
its existing transaction. It does not deploy anything or create payment attempts.
The rehearsal must precede this: it intentionally requires the old baseline.

## 4. Post-migration functional and concurrency testing (separate approval)

Use the guarded [Phase 5 procedure](PHASE5_REVIEW.md) and
`cloud/codespace_test_checkout.py`. The legacy `database_setup.py concurrency`
execution path is retired: its exit-code-only/manual-output review is insufficient
for controlled hosted testing. The new wrapper reuses the original specification,
compares reviewed isolated transcripts and checks exact migrated state and evidence.

No hosted synthetic records or concurrency tests are authorized by preparation.
The review records a real profiles.role authorization concern; it must not be
misrepresented as a passing security check or silently repaired by test fixtures.

## 5. Local verification and remaining gates

```sh
python3 -m unittest discover -s backend/checkout-prepare/development/tests -v
# Optional isolated PostgreSQL runtime outside the repository:
npm install --prefix /tmp/oddgrid-phase3-runtime --no-package-lock --ignore-scripts @electric-sql/pglite@0.5.10
node backend/checkout-prepare/tests/run-isolated.mjs /tmp/oddgrid-phase3-runtime/node_modules/@electric-sql/pglite/dist/index.js
node backend/checkout-prepare/development/tests/run-catalog-isolated.mjs /tmp/oddgrid-phase3-runtime/node_modules/@electric-sql/pglite/dist/index.js
node --test tests/*.test.mjs
npx tsc --noEmit
npm run build
```

The new isolated runner checks inventory/comparison SQL, intentional mismatch
rejection, migration+existing-suite rehearsal and complete rollback. Embedded
single-session PostgreSQL does not establish hosted export/restore compatibility,
managed-auth behavior or transactional multi-session concurrency.

Outstanding operator inputs: passwordless connection endpoints, securely supplied
securely supplied database password, an authentic current dump, compatibility
review and separate approval for each hosted execution/write phase. The cloud
route avoids Windows tools entirely. A checksum-pinned CLI was tested with
version/help commands in ChatGPT Work; no credentialed CLI operation ran. See
[cloud/README.md](cloud/README.md) for current connection checks and prerequisites.

Keep frontend `CHECKOUT_CONTRACT_REVIEWED=false`, Edge entry point
`DEPLOYMENT_APPROVED=false`, and the deployed 503 handler unchanged. Do not link
the production storefront to development, change Netlify settings, deploy Edge
Functions or enable checkout/payment processing. This procedure initializes and
tests database structure only; payment/order execution is out of scope.

Implementation verification (2026-10-21): 10 Python safety tests and all 56
existing JavaScript tests passed; both embedded PostgreSQL runners passed.
`npx tsc --noEmit`, `npm run build`, targeted ESLint on the new JavaScript runner,
Python compilation and `git diff --check` passed. Build emitted existing
third-party bundling/configuration warnings. Hosted CLI export/restore,
Supabase-managed dependencies and multi-session concurrency were not executed.

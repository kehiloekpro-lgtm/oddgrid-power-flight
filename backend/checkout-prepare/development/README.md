# Phase 3: schema-only development initialization

For the browser-only route verified on 2026-10-22, see
[cloud/README.md](cloud/README.md). Both projects are now accessible through the
Supabase integration; Development is `ogbnpvroaafgpnlxeftw`. The earlier local
operator commands below remain available, but Windows installations are not
required for the cloud export route. No hosted write approval is implied.

Prepared for source `izixhjstwfgywbgrnrey`, branch
`integration/supabase-demo-product`, starting commit `eafa8a3`.
**No hosted write operation has been executed.** Read-only integration checks
on 2026-10-22 verified Development `ogbnpvroaafgpnlxeftw`. Database credentials
and an authentic current CLI schema dump remain unavailable.
No baseline has been fabricated. The prior SQL metadata fixture is test material,
**not a development initialization script**.

## Tools and source of truth

Use Python 3, `psql`, Docker and the supported Supabase CLI on a trusted operator
machine. Authenticate the CLI with `supabase login` there. Record its version;
the export manifest records `supabase --version`. Obtain both **database**
passwords from the respective dashboards; API keys are neither needed nor accepted.
The script prompts without echo and never puts passwords in its command arguments.
Do not paste passwords into URLs, shell history, source control or test reports.
Optional `ODDGRID_SOURCE_DB_PASSWORD` / `ODDGRID_DEV_DB_PASSWORD` are supported for
secure automation; interactive prompting is preferred. Do not enable shell tracing.

The supported CLI command used by `export` is:

```sh
supabase --workdir "$TEMP_CLI_DIRECTORY" db dump --linked \
  --schema public,private --file "$BUNDLE/schema.sql"
```

It runs after `init` and `link --project-ref izixhjstwfgywbgrnrey` in a disposable
local CLI directory, whose linked reference is checked. The default dump is
schema-only. **Do not add `--data-only` or `--role-only`.** No customer, supplier,
auth-user, order, payment, storage-object, migration-history or credential records
are exported. Application functions can themselves contain hardcoded secrets:
a limited automatic secret scan is followed by mandatory private human review.
Do not commit the actual dump or manifest. The script refuses an export inside
this repository and creates a private bundle directory/files (0700/0600).

Source access is metadata-only: the inventory uses `pg_catalog`; source psql/CLI
processes receive read-only transaction defaults. No `db pull`, history repair,
`db push`, `db reset`, migrations or application RPC calls run on the source.
CLI `link` only establishes a local source context. The export inventories source
structure before and after dumping and rejects metadata changes during the dump;
freeze source schema edits during this procedure for a reproducible baseline.

References checked 2026-10-21:
[CLI dump](https://supabase.com/docs/reference/cli/supabase-db-dump),
[link](https://supabase.com/docs/reference/cli/supabase-link),
[Supabase restore guidance](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).

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
by the CLI. It contains no data or login-role/password export.

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
  auth/storage/realtime; `managed_policies` flags policies there. If present,
  the automatic write gate stops: obtain a reviewed metadata-only export of
  those custom definitions (for policies, inspect `pg_policies` fields
  `roles,cmd,qual,with_check,permissive`), reconcile with the target's managed
  defaults, and prepare a scoped compatibility change. Do not recreate or dump
  platform tables wholesale. This is an explicit compatibility blocker, not a
  reason to remove authentication helpers or RLS.
- Check external callbacks, HTTP/database-link functions, event triggers and
  scheduled jobs. Disable or omit source integrations through a reviewed
  development-only compatibility change; never copy secret records. Rehearsal
  inserts one synthetic `auth.users` identity and can fire real custom hooks.
  Do not run it until those hooks are reviewed as isolated from production.
- Verify the dump contains no record inserts/COPY, passwords, service keys or
  embedded credentials. Global/external DDL, top-level non-DDL and arbitrary psql
  commands are rejected. Automatic scanning is not proof of absence of secrets.

The only automatic dump normalization is top-level `CREATE SCHEMA public` to
`CREATE SCHEMA IF NOT EXISTS public` because Supabase already has that schema.
Routine bodies and generated columns remain intact. Before restore, Supabase's
recommended public default-grant revocation prevents target defaults broadening
new table permissions; the source dump must restore the actual source grants.
A metadata/ACL comparison **inside the same transaction** aborts and rolls back
if restored structure or permissions differ. This intentionally fails closed
on CLI ownership/ACL filtering rather than silently accepting a weaker baseline.
Resolve any mismatch in a reviewed compatibility change; do not remove the check.

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

## 4. Concurrent development verification (separate approval)

After the approved development migration, install PostgreSQL's matching
`isolationtester` executable locally (typically built from PostgreSQL's
`src/test/isolation`; it is not `pg_isready`). Then, after separate authorization
for committed synthetic checkout/cart fixtures:

```sh
python3 "$SCRIPT" concurrency --dev-ref "$DEV_REF" --dev-url "$DEV_URL" \
  --bundle "$BUNDLE" --reviewed-sha256 "$BASELINE_SHA" \
  --isolationtester /absolute/path/to/isolationtester \
  --execute --approval "concurrency:$DEV_REF"
```

This reuses `tests/checkout-concurrency.spec`, replacing only its local database
name guard with the same checked Supabase environment guard. All original
schedules, locks, assertions and teardown remain. It refuses populated custom
tables before running and checks for leftover custom-table records afterward.
It connects multiple sessions to the verified development endpoint; never point
that spec directly at a hosted database. Schedules cover same-key retries,
variant price writes, cart quantity/insertion races and foreign-cart key reuse.

**Concurrency is not rollback-only.** Fixtures commit between sessions and normal
teardown deletes them. On interruption/failure, stop and inspect synthetic
`a1...`–`a5...` fixture records and sessions in development; do not blindly retry
or delete unrelated data. Results are saved privately to
`$BUNDLE/concurrency-results.txt`. Review every schedule against the expectations
in the existing spec: intended `22023` rejection/waits are expected; duplicate or
partial snapshots, unexpected errors, unresolved waits or deadlocks need review.
`isolationtester` exit zero alone is **not** a concurrency pass. No hosted
concurrency results are claimed by this commit.

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
single-session PostgreSQL does not establish CLI/Supabase restore compatibility,
managed-auth behavior or transactional multi-session concurrency.

Outstanding operator inputs: passwordless connection endpoints, securely supplied
database passwords/scoped CLI token, an authentic current dump, compatibility
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

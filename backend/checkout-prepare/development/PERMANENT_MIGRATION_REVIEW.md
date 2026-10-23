# Permanent Development migration: approval checkpoint

Prepared 2026-10-23 after the successful hosted rollback-only rehearsal at
`bcc1d42b2fac5c34162276e977aa44e300a06035`. No hosted permanent migration,
baseline restoration or additional hosted rehearsal was run in this assignment.

## Bound inputs

- Repository `kehiloekpro-lgtm/oddgrid-power-flight`, clean branch `integration/supabase-demo-product`.
- Only write destination: Development `ogbnpvroaafgpnlxeftw`.
- Original `izixhjstwfgywbgrnrey` excluded from all writes.
- Private baseline SHA-256: `88f212dc644104e7a7b3a7c256badb8a35ecc4baa7a4d27a00d57d5006bb0354`.
- Unchanged migration `backend/checkout-prepare/migrations/20261021_001_secure_variant_checkout.sql`.
- Migration SHA-256: `87a0aa1b344f6820703af1b3fea6e35b50f8e4dce9339ba7ec0e915cb1dc583d`.
- Expected migrated catalogue SHA-256: `a3b60b61908845e4183d584d92dbb03139a825f09d8c39cdfe1ffc0011f12f3d`.

The expectation was derived by applying the exact migration to the unchanged
private baseline in network-disabled disposable PostgreSQL 17.6, then rolling that
derivation back. Only the checksum is public. `~/oddgrid-migration-private/expected.json`
is private (directory 0700/file 0600), outside Git and separate from the original
export. Its full catalogue includes exact function body/definition hashes, owners,
search paths, SECURITY DEFINER flags, grants, table columns/generated expressions,
constraints/indexes, RLS, default privileges and the reviewed authentication hook.
Outer array order is normalized; nested column/enum/ACL definitions are retained.

## Dedicated operation

`cloud/codespace_migrate.py` reuses reviewed branch/commit/bundle checks and
`database_setup.py apply-migration`. It exposes only read-only readiness, one
permanent Development migration, and independent verification. It does not expose
restore, payment execution, rehearsal, deployments or another project selector.
It requires the verified Development Session Pooler on port 5432 and reads only
`ODDGRID_DEV_DATABASE_URL` and `ODDGRID_DEV_DB_PASSWORD` for database access.
Source passwords, privileged API tokens and inherited PG redirection settings are
removed from psql's child environment. Credentials do not appear in arguments or
output. TLS remains required; no settings or permissions are weakened.

The core apply action also pins Development, the private bundle/manifest, checksum,
and clean reviewed Git commit. It checks the full pre-migration baseline and empty
application tables before planning. Under one transaction it obtains deterministic
ACCESS EXCLUSIVE application-table locks, then rechecks the baseline/emptiness and
managed-state fingerprint. Lock timeout is 5 seconds; statement timeout is 60
seconds. The client uses ON_ERROR_STOP and a bounded subprocess timeout.

The unchanged migration's original BEGIN/COMMIT are stripped only for embedding in
this single transaction. Its guarded body, timeout settings, DDL, function grants
and transactional NOTIFY remain unchanged. The complete expected post-migration
catalogue, effective RPC privileges, empty records and managed state are checked
**before COMMIT**. Any SQL error aborts the transaction; disconnect rolls it back.
This adds verification around the migration, not a different migration mechanism.

Before the write connection starts, an exclusive private `execution.json` intent
record is created with project, reviewed commit, input hashes, managed fingerprint,
auth count and both sequence states. It is not proof of a successful commit.
Existing intent evidence refuses another execution. Network/timeout ambiguity
never triggers retry, reset, object cleanup, credential changes or recovery writes.

## Independent verification

After COMMIT, fresh read-only connections run the verifier automatically. The
standalone `--verify-only` path independently verifies the same result without
requiring the old baseline or invoking the migration. It requires the bound private
intent record and exact reviewed commit. It compares every application catalogue
category against the pinned expectation, not merely object names, and checks
effective anon/authenticated/service_role execution. PUBLIC grants are included in
the exact ACL comparison. Unexpected browser-role inheritance is rejected.

The verifier also compares managed objects/permissions, auth-user count and both
sequence values/is_called flags to the execution prestate. It verifies the original
auth trigger definition and enabled state, unchanged RLS/policies/table grants,
and absence of application records. No functional checkout or payment calls run.
Expected body equality establishes that the reviewed authoritative price selection
and snapshot implementation is installed; it does not prove new concurrency or
end-to-end frontend behaviour.

## Expected persistent changes

- Nullable `variant_id uuid` and `variant_name text` appended to checkout/order
  item snapshots. No historical values guessed; generated `line_total` retained.
- Product-only checkout uniqueness replaced by partial unique indexes for base
  products and selected variants. No table recreation or CASCADE.
- Two token-aware checkout overloads added; guarded legacy signatures retained.
- Checkout creation uses database prices, selected variants and locked guest-token
  authorization; no customer totals accepted.
- Finalization definition gains only variant snapshot copy fields; it is never
  invoked. Existing checkout/payment safeguards remain.
- No changed RLS, application table grants, auth trigger, managed objects, records,
  sequence values or unrelated function definitions are expected.

## Migration history and failure procedure

This deliberately preserves the existing raw-psql apply workflow. It does not call
Supabase CLI db push/apply_migration and does not insert into
`supabase_migrations.schema_migrations`. No hosted history table is created or
altered. Audit evidence is the reviewed Git commit, checksums, exclusive private
intent record and exact database-definition verification. Before adopting a future
CLI history workflow, reconcile this operation explicitly; never blindly replay
the one-time SQL file. Baseline guards and existing-intent rejection prevent repeat.

If execution or verification fails, stop and report the stage and known state.
Do not delete the intent record, retry, reset objects or apply more SQL. A SQL error
before COMMIT should roll back; a lost COMMIT response is ambiguous until authorized
read-only inspection resolves it. Post-commit verification failure does not trigger
a compensating migration. The independent command below is available for read-only
investigation under the applicable authorization. No automatic recovery is defined.

## Evidence and limitations

- 57 Python safety/wrapper tests passed, including no write in default/verify modes,
  wrong approval, retry rejection, simulated network failure without retry, atomic
  boundaries and expected-artifact tamper rejection.
- 35 existing checkout/Edge tests passed; deployed/staged payment gates unchanged.
- Actual private baseline in disposable network-disabled PostgreSQL: actual apply
  implementation committed and independently verified; standalone verifier passed;
  injected pre-commit verification failure rolled back; already-migrated replay and
  ACL drift were rejected. No payment/finalization invocation or checkout fixtures.
- Python compilation and whitespace checks passed. No frontend files changed;
  frontend build/type checks passed in the preceding phase and were not rerun here.

Hosted readiness is read-only. The new permanent wrapper has not executed against
Supabase. Managed Auth services/extensions are not fully reproduced in Docker;
the previous hosted rehearsal exercised the unchanged migration on real Supabase.
Multi-session concurrency, real staff authorization and end-to-end Auth/Edge tests
remain separate. Historical NULL snapshots were tested in the preceding rehearsal;
this permanent operation intentionally refuses populated application tables.

## Exact operator commands (existing cloud Codespace)

Keep Development idle: no Auth signups, dashboard edits or background writers
during execution/verification. The application must remain empty. Unrelated
concurrent managed/auth changes conservatively fail verification rather than
being silently accepted. Existing credentials and private evidence must be present.

Substitute the final full commit hash supplied in the completion report; do not
substitute another baseline or migration. No Windows installations are required.

```sh
# Read-only readiness (no approval for writes implied):
python3 backend/checkout-prepare/development/cloud/codespace_migrate.py --reviewed-commit REVIEWED_FULL_COMMIT

# Only after explicit permanent Development migration approval:
python3 backend/checkout-prepare/development/cloud/codespace_migrate.py --reviewed-commit REVIEWED_FULL_COMMIT --execute --approval apply-migration:ogbnpvroaafgpnlxeftw

# Independent post-migration verification, read-only fresh connections:
python3 backend/checkout-prepare/development/cloud/codespace_migrate.py --reviewed-commit REVIEWED_FULL_COMMIT --verify-only
```

Stop at the approval checkpoint. Applying permanently to Development does not
authorize fixture/concurrency tests, Edge deployment, payments, original-project
changes or storefront deployment.

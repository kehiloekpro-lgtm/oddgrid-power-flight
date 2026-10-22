# Cloud-only export preparation — 2026-10-22

The preferred branch-only route is now [GitHub Codespaces](CODESPACES.md),
which avoids a separate utility repository and the Actions default-branch
requirement. The **manual GitHub-hosted Actions export in a separate private
utility repository**, described below, remains an alternative. Nothing needs to be installed on Windows. The workflow is
staged here as a template, not registered or executed. Neither hosted database
has been changed. Source project `izixhjstwfgywbgrnrey` is permanently excluded
from all write actions; intended Development is `ogbnpvroaafgpnlxeftw`.

## Verified access and execution constraints

Read-only checks through the connected Supabase integration confirmed:

| Project | Name | PostgreSQL | public/private application tables | Managed auth |
| --- | --- | --- | --- | --- |
| `izixhjstwfgywbgrnrey` | OddGrid | 17.6 | 28 | Present |
| `ogbnpvroaafgpnlxeftw` | OddGrid Development | 17.11 | 0; `private` absent | Present |

Both project metadata calls and explicit `BEGIN READ ONLY` metadata queries
succeeded. No connection authorization is currently needed for those tools.
No customer, supplier, auth-user, order or payment records were read.
The integration exposes SQL execution, table/extension/migration inspection and
type generation, but **no schema dump/pg_dump tool**. These can inspect the
contracts; reconstructing a schema from them is not equivalent to a supported
complete export. Do not use database filesystem/OS execution as a workaround.

ChatGPT Work has Python and can run the isolated checks. The verified CLI
binary is temporary; psql, Docker/daemon and GitHub CLI are not installed here,
so a full container-backed dump cannot currently run in this workspace.

GitHub repository reads are connected and branch commits are available. The
storefront repository is **public**, its default branch is **main**, and the
inspected main tree has **no workflow files**. Actions secrets cannot be
inspected/configured by the available connector; it also provides no workflow
dispatch action. The generic fetch tool rejected the workflow-list endpoint;
workflow absence was verified from the default-branch Git tree instead.

GitHub requires a `workflow_dispatch` workflow to exist on the **default branch**
for manual dispatch. Adding one only to the storefront integration branch would
not provide an executable manual route. Moving it to storefront main or changing
the storefront default branch is outside the assignment. A public repository's
plain artifacts must not be treated as private secrets storage.

When using Actions, after separate approval use a dedicated **private utility repository**
whose default branch contains only the reviewed export workflow. No Netlify,
Lovable or Supabase deployment integration should be attached to that repository.
It checks out the public storefront repository at an exact reviewed commit from
`integration/supabase-demo-product`. It never writes back to either repository.
The workflow explicitly refuses execution in the storefront repository and in
any public repository. The utility repository's creation and activation have
**not** been performed or authorized here.

## Baseline fidelity and narrow compatibility changes

The existing `database_setup.py export` remains the export engine: it inventories
metadata, initializes a disposable CLI context, links **only the exact source
reference**, verifies that link and runs:

```sh
supabase --workdir "$DISPOSABLE_CONTEXT" db dump --linked \
  --schema private,public --file "$PRIVATE_BUNDLE/schema.sql"
```

The default CLI dump contains schema definitions, not application records or
custom login roles. It preserves the selected user schemas' tables, enums/types,
functions, views, constraints, indexes, triggers, RLS definitions and emitted
privileges/ownership. Custom roles and extension availability remain explicit
restore dependencies; no passwords or role records are exported.
Source sessions use read-only defaults; no source application RPC, DDL/DML,
`db pull`, migration-history repair, `db push` or deployment command is invoked.
The passwordless source endpoint and CLI link must both match
`izixhjstwfgywbgrnrey`. Source metadata must match before and after dumping.

**Actual cross-schema dependency found:** `auth.users.on_auth_user_created`
executes `public.handle_new_user()` and is enabled normally (`O`). The helper
function is in the user-schema dump, but its attachment to managed `auth.users`
is excluded by the standard CLI schema selection. The narrow changes are:

- `catalog.sql` now records each managed attachment's actual trigger definition
  and enable mode, alongside the existing user-schema inventory.
- The export produces `managed-schema-attachments.sql` from those inspected
  definitions, preserving normal/disabled/always/replica modes. It does not
  export/recreate managed tables, auth users or storage objects.
- SQL file reads/writes preserve literal/routine line endings, including CRLF;
  the export checksum covers the actual UTF-8 bytes.
- The supplement is secret-scanned and checksummed in `manifest.json`, and
  checksum-checked when loading the bundle. Unhandled managed policies stop the
  export instead of silently claiming completeness. Current managed-policy
  inspection found zero policies in auth/storage/realtime.
- `cloud/run_export.py` is a single-purpose wrapper exposing **only export**,
  validating the private manual event, utility repository, default branch,
  explicit approval acknowledgement, exact source checkout and project IDs.

This yields a **candidate faithful user-schema baseline plus the known managed
attachment**. Fidelity is not certified merely by successful metadata inspection
or archive creation: the actual CLI output must be reviewed for missing
ownership/grants, custom roles/extensions, external hooks and cross-schema
references. Existing restore comparisons and the managed-customization stop
remain enforced. Because the known auth hook exists, the old restore command
will still stop until a later approved compatibility step explicitly coordinates
the user-schema restore, reviewed attachment and managed dependency checks in
one controlled development procedure. No restore gate has been weakened here.

Both projects are Postgres 17. A read-only comparison confirmed matching
installed extension names, versions and schemas: `pg_stat_statements` 1.11,
`pgcrypto` 1.3, `plpgsql` 1.0, `supabase_vault` 0.3.1 and `uuid-ossp` 1.1. Current Supabase policy can ignore explicit extension version
clauses; do not try to force older versions or weaken the existing compatibility
check. Review supported versions in Development before any restoration.

## Operator actions — browser only, after separate approval

1. Obtain approval to create/use a private utility repository, e.g. an operator-
   chosen `oddgrid-database-tools`. This name is an example, not an existing repo.
   Enable GitHub-hosted Actions there. Confirm the account has sufficient runner
   allowance; no paid service or repository was created by this assignment.
2. Copy **only** `schema-export.workflow.yml` from this directory into that
   repository's default branch as `.github/workflows/oddgrid-schema-export.yml`,
   using GitHub's web editor. Do not copy it to storefront main. The source code
   itself stays in the OddGrid integration branch.
3. In the private utility repository, open **Settings → Secrets and variables →
   Actions** and create repository variables:

   | Variable | Value |
   | --- | --- |
   | `EXPORT_RUNNER_REPOSITORY` | Exact `owner/private-utility-repository` |
   | `ODDGRID_SOURCE_DATABASE_URL` | Passwordless **source session pooler** connection URL from its Connect dialog, port 5432, `/postgres` |

   Use the source project's **actual** dashboard pooler host; do not guess its
   AWS pooler identifier from the region. The username must be
   `postgres.izixhjstwfgywbgrnrey`. Remove `:PASSWORD` entirely from the URL.
   Direct `db.izixhjstwfgywbgrnrey.supabase.co` is also accepted when the runner
   has IPv6 connectivity; the session pooler avoids that requirement.
4. Add these **Actions repository secrets only in the private utility repo**:

   | Secret | Required access |
   | --- | --- |
   | `ODDGRID_SOURCE_READ_TOKEN` | Expiring Supabase scoped PAT for **source project only**, read access required by CLI linking/project configuration/database metadata; no write or API-key-secret capabilities |
   | `ODDGRID_SOURCE_DB_PASSWORD` | Existing source database password for the dashboard connection; never reset it as part of this procedure |

   The scoped PAT is passed as `SUPABASE_ACCESS_TOKEN`; no interactive CLI login
   is needed. It is separate from the database password. A 403 is a configuration
   blocker: inspect missing *read* capabilities privately; do not grant write
   scopes automatically. The source database password may itself have write
   power; execution is constrained to the reviewed read-only export path and
   read-only transaction defaults. Do not claim it is an intrinsically
   read-only database account. Do not create a source role or change its grants.
   No development password, service-role/secret API key, PayPal credential or
   Netlify token is needed or supplied. Do not paste secrets into ChatGPT,
   workflow inputs, variables, code, logs or URLs. Keep the utility repo's
   collaborators and permitted workflows restricted to the approved operators.
5. Review the exact integration-branch commit containing this preparation. In
   the private repository's **Actions → OddGrid source schema export only → Run
   workflow**, select its default branch and enter:

   | Input | Value |
   | --- | --- |
   | `source_revision` | Full reviewed 40-character OddGrid integration-branch commit SHA reported with this change |
   | `schemas` | `public,private` |
   | `approval` | `export-schema-only:izixhjstwfgywbgrnrey` |

   **Dispatch only after separate explicit authorization for credentialed
   execution.** Typing the acknowledgement is not a substitute for approval.
6. The isolated `ubuntu-24.04` runner supplies Python, Docker and psql; missing
   tools stop the job. It installs Supabase CLI **2.121.0**, verifies its release
   archive SHA256 and discovers dump/link flags via `--help`. The checksum was
   obtained from the official release metadata and independently verified when
   downloading/testing the CLI in ChatGPT Work. Checkout/upload actions are
   pinned to inspected commit SHAs. No packages are installed on Windows.
7. On success, the private, one-day artifact contains only `schema.sql`,
   `managed-schema-attachments.sql`, `manifest.json` and `cloud-provenance.json`.
   No artifact uploads on export failure. SQL text and raw database errors are
   suppressed in logs; the export is not cached or committed. Temporary bundle
   and CLI files are removed even on failure. GitHub-hosted runners are ephemeral.
   Private repo readers may download the artifact: privacy is access control,
   not a claim that collaborators cannot read it. Delete it after review or let
   its one-day retention expire. No public release/Pages link is generated.
8. Review the private bundle in an approved cloud workspace or download it for
   inspection as ordinary files; Windows database tooling is unnecessary. Do not
   paste the dump into a public issue or commit it. A separate approved cloud
   runner can later consume this reviewed bundle and reuse the existing guarded
   restore/rehearsal scripts. **No restore or migration workflow is provided or
   authorized in this phase.** A later controlled development restore must
   incorporate the reviewed auth attachment before any auth-user fixture tests.

## Safe next operations and authorization boundaries

Already performed: metadata/project reads on both projects, public GitHub tree
inspection, CLI version/checksum/help verification and local isolated tests.
These do not initialize a database. No credentialed workflow has been run and no
new repository, Actions secret or Supabase credential has been created.

Extension names/versions/schemas have also been compared read-only and match.
The next useful safe read-only operation is to inspect the source auth-hook
function definition and its dependencies against the managed auth objects in
Development, or review the source session-pooler endpoint in the dashboard.
No database credentials are needed for connector metadata reads. Neither
operation alone is a complete dump.

Separate authorization is required for private utility repository setup, secret
configuration and any workflow run supplied with hosted credentials. Baseline
restoration, trigger attachment creation, checkout migration/rehearsal and later
concurrency tests require their own development-only approval. Edge deployment,
checkout enablement and payment/order execution remain excluded.

## Local validation and references

```sh
python3 -m unittest discover -s backend/checkout-prepare/development/tests -q
node backend/checkout-prepare/development/tests/run-catalog-isolated.mjs /tmp/oddgrid-phase3-runtime/node_modules/@electric-sql/pglite/dist/index.js
```

These validate manual/private/exact-project boundaries and real generated
metadata/supplement SQL on isolated embedded PostgreSQL. They do **not** prove a
hosted CLI dump/restore, token scope compatibility, GitHub-runner networking or
multi-session concurrency. Those remain unexecuted until separately approved.

Official references checked 2026-10-22:

- [Supabase CLI schema dump](https://supabase.com/docs/reference/cli/supabase-db-dump)
- [Supabase scoped PATs](https://supabase.com/changelog/scoped-personal-access-tokens-ga)
- [Extension version policy](https://supabase.com/changelog/extension-version-pinning-ignored)
- [GitHub manual dispatch and default-branch requirement](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)
- [GitHub artifacts](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflow-artifacts)

Validation completed in ChatGPT Work: 18 Python safety tests passed; isolated
PostgreSQL inventory, attachment-definition/enable-mode reproduction, mismatch
rejection and full rollback rehearsal passed. Workflow YAML structure, Python
compilation, targeted JavaScript lint and whitespace checks passed. CLI 2.121.0
version/dump-help/link-help were run from the checksum-verified binary with no
credentials. No frontend code changed; its build was not rerun for this
export-only preparation. Hosted workflow execution remains unverified.

The official [Ubuntu 24.04 runner image inventory](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md)
was inspected: Python 3.12.3, PostgreSQL 16.15 and Docker client/server 28.0.4
were listed. The workflow checks tool/daemon availability again at runtime.

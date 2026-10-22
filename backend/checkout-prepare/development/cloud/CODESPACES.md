# Recover the existing Codespaces schema export

Use the **existing**, already working OddGrid export Codespace on
`integration/supabase-demo-product`. No new Codespace, container rebuild, paid
service, PowerShell or Windows installation is needed. Do not restore anything.

## Verified diagnosis and limits

- Existing preflight/DB/metadata success is recorded by the operator. Independent
  read-only source inspection also confirmed that the exact schema-selection
  query returns only `private` and `public`, so extra schemas are not currently
  the blocker. The schema guards remain unchanged.
- CLI 2.121.0 was downloaded, checksum-verified and its `init` command reproduced
  successfully in a fresh local directory with **no credentials or project link**.
- The pinned version's actual
  [link source](https://github.com/supabase/cli/blob/v2.121.0/apps/cli/src/commands/link/link.handler.ts)
  calls `getProjectApiKeys({ ref, reveal: true })`, extracts `serviceRole` and
  performs service probes. This is a verified permission-contract defect in the
  previous export design: a source-only read token must not be broadened to
  reveal service-role keys merely to dump database definitions.
- The two original Codespace failures' exact stages are **unconfirmed**. Their
  generic catch discarded evidence; successful metadata alone cannot prove that
  linking, Docker dump or SQL validation succeeded. Do not label those attempts
  definitively as authentication/link failures without stage evidence.
- Work has no Codespaces terminal/SSH connector. Its browser navigation to
  GitHub Codespaces reached the GitHub sign-in page, not the owner's workspace.
  The connected GitHub API does not authenticate that browser or expose the
  Codespace's secrets/terminal. The operator must run the commands below in the
  existing browser terminal; do not send credentials into chat or create new
  infrastructure as a workaround.

## Correction

The existing Python exporter now invokes **standard PostgreSQL schema-only
pg_dump directly**, using Docker only as a client-tool runtime:

- Official `docker.io/library/postgres:17.6`, pinned to linux/amd64 manifest
  `sha256:b86568d3e0fe1dfaeff52714f9da36f206a30e4c49131b82bf96982d78627409`.
  The manifest was resolved through the official Docker registry. No moving tag
  determines the executable. Actual pull/run remains a Codespace runtime check.
- The server entry point is overridden with `pg_dump`; the container never
  starts or initializes a PostgreSQL server. Root filesystem is read-only,
  capabilities dropped, no-new-privileges enabled, and output uses the operator's
  UID/GID in the private mounted output directory.
- `--schema-only --strict-names --schema private --schema public` captures actual
  definitions. Ownership, grants and RLS are retained; no `--no-owner`, `--no-acl`,
  `--data-only`, cleanup, restore, seed or migration command is used. Managed
  schemas are not dumped. Cross-schema prerequisites are still reviewed separately.
- Source reference/endpoint checks, before/after metadata equality, approved schema
  selection, exact function/enum/sequence metadata, SQL safety/secret checks and
  the auth-trigger supplement remain. Passwords stay in environment only; TLS
  `require` and read-only PG options are explicitly passed to the dump container.
- `SUPABASE_ACCESS_TOKEN` is **not used or forwarded**; leave the existing secret
  alone or manage it separately. No API keys are requested. Existing source URL
  and source DB password secrets suffice. No expanded permissions are needed.

The existing installed Supabase CLI may remain; it is simply not called. Future
container builds omit its installation. The manual Actions template uses this
same exporter and remains dormant, private-utility-repository-only, dispatch-only.
No storefront main/default-branch change is needed for the Codespaces route.

## Run in the existing browser Linux terminal

First review the new integration commit reported with this change. Then:

```sh
git pull --ff-only origin integration/supabase-demo-product
ODDGRID_REVIEWED_COMMIT='PASTE_NEW_FULL_COMMIT_SHA_FROM_DELIVERY'
python3 backend/checkout-prepare/development/cloud/codespace_export.py \
  --reviewed-commit "$ODDGRID_REVIEWED_COMMIT" \
  --execute --approval export-schema-only:izixhjstwfgywbgrnrey
```

Do not reuse the old `ef80c9e` reviewed SHA after pulling: the clean-tree/exact-HEAD
safeguard intentionally requires the new reviewed commit. The wrapper never
prompts for a password. If git reports local changes, stop and inspect them;
do not reset/discard operator work or bypass the reviewed-commit guard.

The first native client run may pull its pinned image once. A failed stage stops
without retries. No additional Codespace is created and no project is restored.
Export steps print only allowlisted lines such as:

```text
EXPORT stage=schema-selection status=passed
EXPORT stage=schema-dump status=failed category=network_unavailable
```

These lines are examples, **not** results from the owner's Codespace. The private
`~/oddgrid-export-status.json` records exact stage/status/category and exit code
when available, surviving removal of incomplete schema output. It contains no
SQL, function bodies, URLs, passwords, tokens or raw diagnostics. It can be shared
for diagnosis; **do not share the full dump or manifest in public/chat**.

Success must include `EXPORT stage=complete status=passed` and a real SHA-256.
The pipeline independently reopens and verifies all three private nonempty files,
source identity, schema/attachment checksums, SQL safety and 0700/0600 permissions:

- `~/oddgrid-schema-private/schema.sql`
- `~/oddgrid-schema-private/manifest.json`
- `~/oddgrid-schema-private/managed-schema-attachments.sql`

For an additional local-file verification with **no database connection**:

```sh
python3 backend/checkout-prepare/development/cloud/codespace_export.py \
  --reviewed-commit "$ODDGRID_REVIEWED_COMMIT" --verify-only
```

An existing bundle is never overwritten/deleted. A failed new export removes only
its incomplete bundle and retains the sanitized report. Review a successful
bundle privately outside Git; no export is committed or published as an artifact.

## Validation and outstanding work

29 isolated Python tests cover complete synthetic export, exact failures at schema
selection/client/dump/SQL validation, metadata drift, cleanup, preserved existing
bundles, checksum/private permissions, sanitized subprocess errors and context
safeguards. Synthetic tests are not a successful hosted export. PostgreSQL
[documents schema-only extraction and explicit schema selection](https://www.postgresql.org/docs/17/app-pgdump.html).
A hosted run's checksum is unavailable until the operator completes the command.

Read-only source inspection and isolated tests do not certify a future restore.
Review raw pg_dump's Supabase role/default-ACL dependencies and the separately
exported `auth.users` attachment before requesting a development restore. No
function execution, auth-user fixture insertion, checkout migration, deployment,
payment or order finalization is authorized/performed by this phase.

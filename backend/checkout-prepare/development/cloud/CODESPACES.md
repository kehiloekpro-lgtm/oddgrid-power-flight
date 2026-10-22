# Browser-only source export in GitHub Codespaces

Preferred route for the current constraints: create a GitHub-hosted Codespace
from **`integration/supabase-demo-product`**, select the prepared **OddGrid schema
export** development container, and run the existing `database_setup.py export`
through `cloud/codespace_export.py`. All tools run on GitHub's Linux VM. No
PowerShell, PostgreSQL, Docker, Python or CLI installation on Windows is needed.
No new utility repository, default-branch change or Actions workflow is required.
The existing private-utility-repository Actions template remains an alternative.

**Status:** preparation and isolated validation only. No Codespace was created,
no cloud credentials were retrieved/configured and no hosted export or write ran.
An actual `schema.sql` is still unavailable; this document is not a schema dump.

## Read-only dependency checks completed on 2026-10-22

The connected Supabase integration returned actual definitions and metadata,
without executing the auth hook or reading application records:

- `public.handle_new_user()` is owned by `postgres`, `SECURITY DEFINER`, with an
  empty search path. It inserts the new auth ID and first/last names into
  `public.profiles`, then returns `NEW`. Its body contains CRLF line endings;
  the existing export file I/O preserves those bytes. Exact body MD5 at inspection:
  `a39244234d5c7ebe83006d272e0403cb`. This fingerprint is evidence, not replacement DDL.
- Source `profiles.id` is UUID, required; first/last names are nullable text.
  Development's managed `auth.users.id` is UUID and `raw_user_meta_data` is JSONB,
  satisfying the inspected managed-field dependencies. The real baseline must
  create `profiles` and its helper before the separate auth-trigger attachment.
- The actual attachment is `auth.users.on_auth_user_created`, enabled normally,
  calling `public.handle_new_user()`. The trigger deparser was verified with an
  empty search path so it emits the **qualified** helper name. No trigger or
  function was created/changed on either project.
- Additional source metadata: 14 enum types, 28 RLS-enabled tables, 48 user-schema
  policies, 102 indexes, 125 constraints and sequences `public.order_number_seq`
  and `public.rfq_number_seq`, both owned by `postgres`. These are baseline
  review counts, not reconstructed object definitions.

`catalog.sql` now uses an empty search path for unambiguous deparsing, captures
exact function body/definition fingerprints, enum label order and sequence
configuration. Restore comparisons include these fields. Use a **fresh** export;
older inventories are not silently accepted as equivalent. Sequence definitions
and configuration are exported; live counter values/records are not copied.
The checkout migration, live function definitions and all activation gates are
unchanged. The existing managed-auth-customization restore stop remains intact.

## Operator actions — GitHub website only

1. Review the committed code and record the full commit SHA reported with this
   change. In GitHub **personal Settings → Codespaces → Secrets**, add these
   **account-specific Codespaces secrets**, granting repository access only to
   `kehiloekpro-lgtm/oddgrid-power-flight`:

   | Name | Value |
   | --- | --- |
   | `ODDGRID_SOURCE_DB_PASSWORD` | Existing **original** database password |
   | `SUPABASE_ACCESS_TOKEN` | Short-lived, **source-project-only read** scoped Supabase PAT required by CLI linking/metadata |
   | `ODDGRID_SOURCE_DATABASE_URL` | Original dashboard **session-pooler** URL, port 5432, `/postgres`, with the password removed entirely |

   The URL username must be `postgres.izixhjstwfgywbgrnrey`; use its actual pooler
   hostname from the original project's **Connect** dialog. Do not guess an AWS
   pooler identifier. A passwordless direct endpoint is also accepted when IPv6
   connectivity is available. No development password, API secret/service-role
   key, customer data or payment credential is needed. Do not reset the original
   password, create source roles or change source permissions. These are
   **Codespaces secrets**, distinct from GitHub Actions secrets. Never paste their
   values into chat, source files, terminal commands or a workflow input.
2. Open the repository in GitHub, select `integration/supabase-demo-product`, then
   **Code → Codespaces → … → New with options**. Confirm that branch, and choose
   **OddGrid schema export (manual, source read only)** as the dev-container
   configuration. Use the smallest available machine. Check your included quota
   and spending settings before creation; this assignment did not authorize or
   start paid compute. No prebuild workflow is needed. If secrets were added to
   an existing Codespace, stop/restart it to load them.
3. The Dockerfile installs Python/psql and checksum-pinned Supabase CLI 2.121.0
   **inside the cloud container**. A version-pinned Docker-in-Docker feature
   supplies the daemon needed by the CLI's own pg_dump container. It does not
   install/start a local Postgres server. There are no lifecycle commands to
   start the frontend, query a project, export, deploy or migrate automatically.
   The container has no forwarded export server or public artifact endpoint.
4. In the Codespace's **browser Linux terminal**, set the reviewed SHA (not a
   password), then run local-only preflight:

   ```sh
   ODDGRID_REVIEWED_COMMIT='PASTE_FULL_COMMIT_SHA_FROM_DELIVERY'
   python3 backend/checkout-prepare/development/cloud/codespace_export.py \
     --reviewed-commit "$ODDGRID_REVIEWED_COMMIT"
   ```

   It requires the exact repository, clean integration branch, reviewed HEAD,
   original endpoint, pinned CLI and healthy Docker daemon. It makes **no
   database connection** in this default mode. Wrong/missing setup stops rather
   than switching projects or requesting an interactive password.
5. After reviewing the source-only execution step, run the export explicitly in
   that same browser terminal:

   ```sh
   python3 backend/checkout-prepare/development/cloud/codespace_export.py \
     --reviewed-commit "$ODDGRID_REVIEWED_COMMIT" \
     --execute --approval export-schema-only:izixhjstwfgywbgrnrey
   ```

   Only the existing `export` action is exposed. It validates the original
   endpoint and CLI link, uses read-only source sessions, and performs the
   supported command `supabase db dump --linked --schema private,public` to an
   output file. There are no data-only, role-only, restore, migration, Edge,
   payment or source-schema mutation commands. No database password enters argv.
   A missing read scope, network restriction or cloud tool failure is a blocker;
   do not grant write scopes, open database networking or weaken guards as a
   workaround. The database password can have write power; the reviewed export
   code/transactions restrict its use, not a claim that it is a read-only role.
6. The private cloud directory `$HOME/oddgrid-schema-private` contains
   `schema.sql`, `manifest.json` and `managed-schema-attachments.sql` (0700/0600).
   The supplement contains the inspected auth attachment and enable mode; it
   does not recreate managed tables/users. The directory is outside the Git
   checkout, and the exporter refuses writing a dump inside the repository.
   Do not move it into the checkout or upload it to a public issue/artifact.
   Use the browser editor's **File → Open Folder** to inspect that private
   directory after the export; return to the repository folder for code work.
   You can download ordinary files through the editor without local DB tools.
   Do not port-forward or serve the export directory. An existing bundle is not
   overwritten; stop and review it before a repeat export.
7. Review the real dump for complete definitions, ownership/grants, RLS and
   dependencies; compare manifest counts/fingerprints with read-only metadata.
   Preserve enum order, security-definer settings, constraints, indexes,
   sequences and helper bodies. Never use the incomplete checkout CSV as the
   baseline or assume CLI output alone certifies fidelity. Keep the reviewed
   export privately for the later approved development operation. Stop/delete
   the Codespace when finished to control persistence/usage. Its disk is cloud
   workspace storage, not an automatically published artifact.

## Remaining boundaries and blockers

The Supabase integration is connected for read-only SQL; it has no supported
pg_dump tool and does not hand a PostgreSQL login to this export process. Work
currently lacks psql/Docker and an approved credential-injection channel. Those
facts prevent an actual supported dump **here**; they are not evidence that the
schema or backend is missing. Codespaces supplies the cloud tools and a supported
secret store directly on the integration branch. No Codespace creation/secret
management tool is exposed to this Work session, so steps 1–2 require the owner.

The next operator action is to configure the three source-only **Codespaces
secrets in GitHub Settings**, then create the branch Codespace. Do not send
passwords through chat. Until then, no real schema export is claimed.

Restoring Development, applying the auth attachment, checkout migrations,
credentialed Actions dispatch and any later live checkout/payment/deployment
operation retain their separate authorization boundaries. This wrapper cannot
restore Development. It never modifies `main`, creates an automatic workflow,
starts Netlify builds or runs a payment/order function. The existing Actions
alternative still requires a private utility repository's default branch; do
not copy its workflow onto storefront main to bypass that requirement.

## Validation and official references

23 Python safety tests and the extended isolated PostgreSQL runner passed,
including fully qualified auth attachment under an empty search path, exact
function fingerprints, enum order, sequence configuration and mismatch rejection.
Docker configuration/CLI checksum, Python compilation, targeted JavaScript lint
and whitespace checks were reviewed. The actual Codespaces image build,
secret injection, hosted CLI export/restore and multi-session concurrency have
**not** been executed. No frontend code changed.

- [Create a Codespace on a selected branch](https://docs.github.com/en/codespaces/developing-in-a-codespace/creating-a-codespace-for-a-repository)
- [Codespaces account-specific secrets](https://docs.github.com/en/codespaces/managing-your-codespaces/managing-your-account-specific-secrets-for-github-codespaces)
- [Codespaces default environment variables](https://docs.github.com/en/codespaces/developing-in-a-codespace/default-environment-variables-for-your-codespace)
- [Development container configuration](https://docs.github.com/en/codespaces/setting-up-your-project-for-codespaces/adding-a-dev-container-configuration/introduction-to-dev-containers)
- [Docker-in-Docker feature](https://github.com/devcontainers/features/tree/main/src/docker-in-docker)
- [Supported Supabase schema dump](https://supabase.com/docs/reference/cli/supabase-db-dump)

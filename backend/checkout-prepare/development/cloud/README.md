# Cloud schema export

For the **existing Codespace and blocked export**, use [CODESPACES.md](CODESPACES.md).
It documents the verified CLI-link permission mismatch, remaining access blocker,
minimal recovery commands, stage diagnostics and private output verification.

The current mechanism is the same guarded Python exporter plus an immutable
**official PostgreSQL 17.6 pg_dump client container**, not `supabase link`.
The source URL and DB password are sufficient; no Supabase PAT/API keys are used.
Neither hosted database has been initialized or migrated by this preparation.

## Manual Actions alternative (not activated)

`schema-export.workflow.yml` remains a `workflow_dispatch`-only template for a
separately approved **private utility repository's default branch**. It cannot
be dispatched solely from the storefront integration branch: GitHub's default-
branch requirement still applies. Do not modify storefront main, change its
repository visibility/default branch, or add automatic triggers to work around it.
No utility repository was created and no workflow was executed.

If that alternative is later approved, copy the template through GitHub's web
editor to `.github/workflows/oddgrid-schema-export.yml` in that private repository.
Configure repository variables `EXPORT_RUNNER_REPOSITORY` (exact owner/name) and
`ODDGRID_SOURCE_DATABASE_URL` (validated passwordless source session-pooler URL),
and only the secret `ODDGRID_SOURCE_DB_PASSWORD`. The previously documented
`ODDGRID_SOURCE_READ_TOKEN` is no longer required or forwarded. No development
password or API secret/service-role key is needed. Do not paste secret values
into chat, workflow inputs or source code.

Dispatch only after separate approval, from the utility repository's default
branch, providing the exact reviewed integration `source_revision`, schema list
`public,private` and acknowledgement `export-schema-only:izixhjstwfgywbgrnrey`.
The workflow checks the private repository/manual event and integration ancestry,
requires Python/psql/Docker, then invokes `cloud/run_export.py`, which exposes
only export. It starts no application/database server, deployment or migration.
The pinned official client image supplies pg_dump; no CLI linking/API-key lookup
occurs. Checkout/upload actions remain SHA-pinned and Git permissions read-only.

On verified success, only the schema, manifest, managed attachment and cloud
provenance upload as a private one-day artifact. A failed export does not upload
partial files. The sanitized stage report stays on the ephemeral runner and only
allowlisted status lines appear in logs; raw diagnostics never upload. Export
files are cleaned up at the end. An exit-zero workflow alone does not prove that
a future restore will succeed; privately review the baseline and dependencies.

Actual credentialed Actions execution, development restore, migrations, Edge
Functions, checkout/payment enablement and orders retain their authorization
boundaries. Use the existing Codespace rather than provisioning this alternative
unnecessarily.

#!/usr/bin/env python3
"""Preparation by default. Never write to the source; hosted writes require explicit operation approval.
Only stdlib + Supabase CLI/Docker/psql on the operator's machine. No stored credentials.
"""
import argparse
import getpass
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from urllib.parse import unquote, urlsplit

SOURCE_REF = "izixhjstwfgywbgrnrey"
ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
MIGRATION = HERE.parent / "migrations/20261021_001_secure_variant_checkout.sql"
TESTS = HERE.parent / "tests"
CONCURRENCY_BRIDGE = "public.checkout_prepare_bridge(uuid,text,text,text,text,text,text,text,text,text,character,uuid,uuid)"
MANAGED = {"auth", "storage", "realtime", "extensions", "vault", "graphql", "graphql_public", "supabase_functions", "supabase_migrations", "pgbouncer", "net", "cron", "information_schema"}
SECRET = re.compile(r"sb_secret_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|postgres(?:ql)?://[^\s'\"]+:[^\s'\"]+@|\bPASSWORD\s+'(?!\*+')[^']+'", re.I)


def endpoint(url, ref, development=False):
    if not re.fullmatch(r"[a-z0-9]{20}", ref) or (development and ref == SOURCE_REF):
        raise ValueError("A different, actual development project reference is required")
    p = urlsplit(url)
    if p.scheme not in ("postgres", "postgresql") or p.password is not None or p.query or p.fragment or p.path != "/postgres":
        raise ValueError("Use a passwordless dashboard connection URL, /postgres, and no query parameters")
    host, user = p.hostname or "", unquote(p.username or "")
    direct = host == f"db.{ref}.supabase.co" and user == "postgres"
    pooled = re.fullmatch(r"[a-z0-9-]+\.pooler\.supabase\.com", host) and user == f"postgres.{ref}"
    if not (direct or pooled) or (p.port or 5432) != 5432:
        raise ValueError("Connection endpoint/user does not match the exact project; use direct or SESSION pooler port 5432")
    return {"PGHOST": host, "PGUSER": user, "PGPORT": "5432", "PGDATABASE": "postgres"}


def schemas(value):
    names = value.split(",")
    if not {"public", "private"}.issubset(names) or any(not re.fullmatch(r"[a-z_][a-z0-9_]*", n) or n in MANAGED or n.startswith("pg_") for n in names):
        raise ValueError("Include public,private and only reviewed user-managed schemas")
    return sorted(set(names))


def child_env(connection, password, readonly):
    env = {k: v for k, v in os.environ.items() if not k.startswith("PG") and k not in {"SUPABASE_DB_PASSWORD", "ODDGRID_SOURCE_DB_PASSWORD", "ODDGRID_DEV_DB_PASSWORD"}}
    env.update(connection)
    env.update(PGPASSWORD=password, PGSSLMODE="require", PGCONNECT_TIMEOUT="10", PGAPPNAME="oddgrid-schema-preparation",
               PGOPTIONS=f"-c default_transaction_read_only={'on' if readonly else 'off'} -c statement_timeout=60000")
    return env


def run(command, env, text=None):
    # Never log raw subprocess diagnostics: SQL/function bodies and tool errors can contain secrets.
    result = subprocess.run(command, input=text, text=True, env=env, capture_output=True, check=False)
    if result.returncode:
        raise RuntimeError(f"{Path(command[0]).name} failed; inspect privately on your machine (raw diagnostics suppressed)")
    return result.stdout.strip()


def psql(connection, password, sql, readonly=True):
    return run(["psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"], child_env(connection, password, readonly), sql)


def catalog(connection, password, names):
    # Identifiers are restricted above; no arbitrary SQL interpolation or source-row reads.
    sql = (HERE / "catalog.sql").read_text().replace(":'schema_csv'", "'" + ",".join(names) + "'")
    return json.loads(psql(connection, password, sql))


def sql_parts(text):
    """Split top-level SQL, preserving dollar-quoted routine bodies and quoted literals."""
    parts, start, i, quote, depth, escaped = [], 0, 0, None, 0, False
    while i < len(text):
        if quote:
            if quote.startswith("$"):
                if text.startswith(quote, i): i += len(quote); quote = None; continue
            elif text[i] == quote:
                if i + 1 < len(text) and text[i + 1] == quote: i += 2; continue
                quote = None
            elif text[i] == "\\" and quote == "'" and escaped: i += 2; continue
            i += 1; continue
        if depth:
            if text.startswith("/*", i): depth += 1; i += 2; continue
            if text.startswith("*/", i): depth -= 1; i += 2; continue
            i += 1; continue
        if text.startswith("--", i):
            i = text.find("\n", i)
            if i < 0: i = len(text)
            continue
        if text.startswith("/*", i): depth = 1; i += 2; continue
        if text[i] in "'\"":
            escaped = text[i] == "'" and bool(re.search(r"(?<![A-Za-z0-9_])[eE]$", text[:i]))
            quote = text[i]; i += 1; continue
        if text[i] == "\\":
            # A psql command must never be mistaken for SQL or removed inside a routine.
            if text[start:i].strip(): parts.append(text[start:i])
            end = text.find("\n", i)
            if end < 0: end = len(text)
            parts.append(text[i:end]); start = end; i = end; continue
        tag = re.match(r"\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$", text[i:])
        if tag: quote = tag.group(); i += len(quote); continue
        if text[i] == ";": parts.append(text[start:i + 1]); start = i + 1
        i += 1
    if quote or depth: raise ValueError("Unterminated SQL quoting/comment")
    if text[start:].strip(): parts.append(text[start:])
    return parts


def leading_sql(part):
    # Strip only leading comments; never rewrite literals or function bodies.
    while True:
        part = part.lstrip()
        if part.startswith("--"):
            part = part.partition("\n")[2]
        elif part.startswith("/*"):
            depth, i = 1, 2
            while depth and i < len(part):
                if part.startswith("/*", i): depth += 1; i += 2
                elif part.startswith("*/", i): depth -= 1; i += 2
                else: i += 1
            if depth: raise ValueError("Unterminated leading comment")
            part = part[i:]
        else: return part


def schema_sql(text):
    if SECRET.search(text): raise ValueError("Potential embedded credential; export is not safe to use")
    result = []
    for part in sql_parts(text):
        head = leading_sql(part)
        if re.fullmatch(r"\\(?:un)?restrict [A-Za-z0-9]+", head.strip()):
            continue  # pg_dump client-only guard; never touches quoted routine bodies.
        if head.startswith("\\"): raise ValueError("Unreviewed psql command in schema file")
        if not head: result.append(part); continue
        if not re.match(r"(?:SET|CREATE|ALTER|COMMENT|GRANT|REVOKE|SECURITY\s+LABEL)\b", head, re.I):
            if not re.fullmatch(r"SELECT\s+pg_catalog\.set_config\('search_path',\s*'',\s*false\);?\s*", head, re.I):
                raise ValueError("Schema file contains a non-DDL statement")
        if re.match(r"CREATE\s+(?:ROLE|USER|SERVER|FOREIGN|EVENT|PUBLICATION|SUBSCRIPTION)\b", head, re.I):
            raise ValueError("External/global objects require separate compatibility review")
        # Only the top-level public schema declaration is normalized. Never rewrite routines.
        if re.fullmatch(r'CREATE\s+SCHEMA\s+(?:"public"|public)\s*;\s*', head, re.I):
            part = 'CREATE SCHEMA IF NOT EXISTS "public";\n'
        result.append(part)
    return "\n".join(result)


def digest(data): return hashlib.sha256(data.encode()).hexdigest()


def write_private(path, text):
    path.write_text(text)
    path.chmod(0o600)


def read_bundle(folder):
    raw = (folder / "schema.sql").read_text()
    manifest = json.loads((folder / "manifest.json").read_text())
    if manifest.get("source_ref") != SOURCE_REF or manifest.get("schema_sha256") != digest(raw):
        raise ValueError("Bundle provenance/checksum mismatch; do not edit or substitute the baseline")
    schema_sql(raw)
    return raw, manifest


def state_guard(require_empty=False, require_baseline=False, names=("public", "private")):
    selected = ",".join("'" + n + "'" for n in names)
    empty = f"""
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname IN ({selected}) AND c.relkind IN ('r','p','f','v','m')
        AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e'))
    THEN RAISE EXCEPTION 'Target is not a fresh schema-only development project'; END IF;
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname IN ({selected}) AND NOT EXISTS (SELECT 1 FROM pg_depend d
      WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')) OR
      EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
      WHERE n.nspname IN ({selected}) AND NOT EXISTS (SELECT 1 FROM pg_depend d
      WHERE d.classid='pg_type'::regclass AND d.objid=t.oid AND d.deptype='e')) THEN
      RAISE EXCEPTION 'Target has pre-existing custom functions/types'; END IF;
    """ if require_empty else ""
    baseline = """
    IF to_regclass('public.carts') IS NULL OR to_regclass('public.product_variants') IS NULL OR
       to_regclass('public.checkout_items') IS NULL OR to_regclass('private.product_costs') IS NULL THEN
      RAISE EXCEPTION 'Restore the real user schema baseline first'; END IF;
    """ if require_baseline else ""
    return """DO $target$ BEGIN
    IF current_database() <> 'postgres' OR current_user <> 'postgres' OR
       to_regclass('auth.users') IS NULL OR to_regprocedure('auth.uid()') IS NULL OR
       NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
      RAISE EXCEPTION 'Expected Supabase postgres/auth/roles environment'; END IF;
    """ + empty + baseline + "END; $target$;\n"


def empty_records_guard(names):
    selected = ",".join("'" + n + "'" for n in names)
    return f"""DO $empty$ DECLARE t record; populated boolean; BEGIN
    FOR t IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN ({selected}) AND c.relkind IN ('r','p') AND NOT EXISTS
      (SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e')
    LOOP
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.%I LIMIT 1)',t.nspname,t.relname) INTO populated;
      IF populated THEN RAISE EXCEPTION 'Rehearsal requires an empty schema-only development baseline'; END IF;
    END LOOP;
    END; $empty$;\n"""


def transaction_body(text, end):
    parts = sql_parts(text)
    # Repository-owned test/migration files only; remove their outer transaction for one atomic rehearsal.
    if parts[0].splitlines()[-1].strip().upper() != "BEGIN;" or parts[-1].strip().upper() != end + ";":
        raise ValueError("Unexpected repository transaction boundaries")
    return "\n".join(parts[1:-1])


def assert_catalog_sql(expected):
    # Compare in the SAME restore transaction; failure rolls back schema/default privilege changes.
    query = (HERE / "catalog.sql").read_text().replace("BEGIN READ ONLY;", "").replace("COMMIT;", "")
    names = [s["name"] for s in expected["schemas"]]
    query = query.replace(":'schema_csv'", "'" + ",".join(names) + "'")
    query = query[query.index("WITH selected"):].strip().rstrip(";")
    keys = ["schemas", "functions", "relations", "constraints", "indexes", "triggers", "policies", "default_acls"]
    checks = " OR ".join(f"actual->'{k}' IS DISTINCT FROM expected->'{k}'" for k in keys)
    payload = json.dumps(expected).replace("'", "''")
    tag = "$compare$"
    while tag in payload: tag = tag[:-1] + "x$"
    return f"SET LOCAL search_path = public, pg_catalog;\nDO {tag} DECLARE actual jsonb; expected jsonb := '{payload}'::jsonb; BEGIN\nSELECT q.* INTO actual FROM ({query}) q;\nIF {checks} THEN RAISE EXCEPTION 'Restored structure/ACLs differ from source; rollback and review compatibility'; END IF; END; $compare$;"


def development_concurrency_spec():
    spec = (TESTS / "checkout-concurrency.spec").read_text()
    original = """DO $$ BEGIN
   IF current_database() <> 'oddgrid_checkout_isolated' THEN
     RAISE EXCEPTION 'Dedicated isolated database required';
   END IF;
 END $$;"""
    if spec.count(original) != 1: raise ValueError("Concurrency guard changed; review adaptation")
    return spec.replace(original, state_guard(require_baseline=True), 1)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["plan", "export", "check-dev", "restore", "rehearse", "apply-migration", "concurrency"])
    parser.add_argument("--isolationtester", default="isolationtester", help="Local PostgreSQL isolationtester executable for existing multi-session specification")
    parser.add_argument("--dev-ref")
    parser.add_argument("--dev-url", help="Passwordless direct/session-pooler URL, never put a password here")
    parser.add_argument("--source-url", help="Passwordless original endpoint for read-only metadata inventory")
    parser.add_argument("--schemas", default="public,private")
    parser.add_argument("--bundle", type=Path, default=Path.home() / "oddgrid-schema-private")
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--approval", help="Operation-bound approval, e.g. restore:<actual-dev-ref>")
    parser.add_argument("--reviewed-sha256", help="Exact schema digest reviewed for embedded secrets and external hooks")
    args = parser.parse_args(argv)
    names = schemas(args.schemas)
    if args.action == "plan":
        print("Source: " + SOURCE_REF + " (schema-only read). Development ref must be supplied from its dashboard.")
        print("Sequence: export -> review manifest/schema -> check-dev -> separately approved restore -> rehearse -> apply-migration.")
        print("No connections, writes, migrations or deployments were attempted.")
        return
    if args.action == "export":
        if not args.source_url: raise ValueError("Provide the passwordless original endpoint")
        connection = endpoint(args.source_url, SOURCE_REF)
    else:
        if not args.dev_ref or not args.dev_url: raise ValueError("Provide the actual Development ref and passwordless endpoint")
        connection = endpoint(args.dev_url, args.dev_ref, development=True)
    write = args.action in {"restore", "rehearse", "apply-migration", "concurrency"}
    if write and (not args.execute or args.approval != f"{args.action}:{args.dev_ref}"):
        print(f"PLAN ONLY: {args.action} on verified distinct endpoint for {args.dev_ref}. No connection/write attempted.")
        print("After explicit authorization, add --execute and the operation-bound --approval value.")
        return
    password = os.environ.get("ODDGRID_SOURCE_DB_PASSWORD" if args.action == "export" else "ODDGRID_DEV_DB_PASSWORD")
    if not password: password = getpass.getpass("Source read-only DB password: " if args.action == "export" else "Development DB password: ")
    if args.action == "export":
        folder = args.bundle.resolve()
        if folder == ROOT or ROOT in folder.parents: raise ValueError("Keep actual schema exports outside the repository")
        folder.mkdir(mode=0o700, parents=True, exist_ok=False)
        try:
            before = catalog(connection, password, names)
            if set(names) != {s["name"] for s in before["schemas"]}: raise ValueError("Requested source schema is missing")
            if set(before["schema_candidates"]) - set(names):
                raise ValueError("Review additional user schemas and include them via --schemas: " + ",".join(set(before["schema_candidates"]) - set(names)))
            cli_version = run(["supabase", "--version"], child_env(connection, password, True))
            # Separate disposable CLI context; never relink the storefront or repair source migration history.
            with tempfile.TemporaryDirectory(prefix="oddgrid-source-cli-") as context:
                env = child_env(connection, password, True)
                env["SUPABASE_DB_PASSWORD"] = password
                run(["supabase", "--workdir", context, "init"], env)
                run(["supabase", "--workdir", context, "link", "--project-ref", SOURCE_REF], env)
                linked = Path(context) / "supabase/.temp/project-ref"
                if not linked.exists() or linked.read_text().strip() != SOURCE_REF: raise ValueError("CLI source link could not be verified")
                run(["supabase", "--workdir", context, "db", "dump", "--linked", "--schema", ",".join(names), "--file", str(folder / "schema.sql")], env)
            raw = (folder / "schema.sql").read_text()
            schema_sql(raw)
            after = catalog(connection, password, names)
            if before != after: raise ValueError("Source metadata changed during export; discard and export again")
            manifest = {"source_ref": SOURCE_REF, "schemas": names, "schema_sha256": digest(raw), "catalog": after, "supabase_cli_version": cli_version}
            write_private(folder / "schema.sql", raw)
            write_private(folder / "manifest.json", json.dumps(manifest, indent=2) + "\n")
            print("Private schema-only bundle prepared; review before restoration. SHA256: " + digest(raw))
        except Exception:
            for p in folder.iterdir():
                if p.is_file(): p.unlink()
            folder.rmdir()
            raise
        return
    psql(connection, password, "BEGIN READ ONLY;\n" + state_guard(require_empty=args.action == "restore", require_baseline=args.action in {"rehearse", "apply-migration", "concurrency"}) + "ROLLBACK;")
    if args.action == "check-dev":
        print("Read-only Supabase environment check passed for distinct development endpoint: " + args.dev_ref)
        return
    raw, manifest = read_bundle(args.bundle)
    if args.reviewed_sha256 != manifest["schema_sha256"]: raise ValueError("Review the actual export and pass its exact --reviewed-sha256")
    source = manifest["catalog"]
    if names != manifest["schemas"]: raise ValueError("Use the same --schemas as the reviewed bundle")
    target = catalog(connection, password, names)
    if target["server_major"] < source["server_major"]:
        raise ValueError("Development PostgreSQL major version is older than source")
    missing = [e for e in source["extensions"] if e not in target["extensions"]]
    if missing: raise ValueError("Extension/version/schema compatibility must be resolved in development first: " + ",".join(e["name"] for e in missing))
    if source["managed_custom_triggers"] or source["managed_policies"]:
        raise ValueError("Source has auth/storage/realtime customizations: review/export them separately before declaring a complete baseline")
    if args.action == "restore":
        # Official Supabase restore caveat: target defaults must not silently broaden table ACLs.
        prelude = "ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;\n"
        sql = "BEGIN;\n" + state_guard(require_empty=True, names=names) + prelude + schema_sql(raw) + "\n" + assert_catalog_sql(source) + "\nCOMMIT;"
    elif args.action == "rehearse":
        if any(target[k] != source[k] for k in ("schemas", "functions", "relations", "constraints", "indexes", "triggers", "policies", "default_acls")):
            raise ValueError("Development structure differs from the baseline; rehearsal requires the pre-migration schema")
        sql = "BEGIN;\n" + state_guard(require_baseline=True)
        sql += empty_records_guard(names)
        sql += (TESTS / "before-migration.sql").read_text()
        sql += transaction_body(MIGRATION.read_text(), "COMMIT")
        sql += "\nSET LOCAL oddgrid.supabase_development_test = 'yes';\n"
        sql += transaction_body((TESTS / "checkout.sql").read_text(), "ROLLBACK")
        sql += "\nROLLBACK;"
    elif args.action == "concurrency":
        psql(connection, password, "BEGIN READ ONLY;" + empty_records_guard(names) + "ROLLBACK;")
        # Keep the existing schedules and assertions. Only replace its local-db guard with
        # our checked Supabase-environment guard; PG* destinations cannot leak from the shell.
        spec = development_concurrency_spec()
        if psql(connection, password, f"SELECT to_regprocedure('{CONCURRENCY_BRIDGE}') IS NOT NULL;") != "t":
            raise ValueError("Concurrency requires the approved checkout migration first")
        result = subprocess.run([args.isolationtester, "dbname=postgres"],
                                input=spec, text=True, env=child_env(connection, password, False),
                                capture_output=True, check=False)
        # isolationtester can exit zero with SQL errors (some rejections are intentional).
        # Keep private output even on failure, but never print potentially sensitive diagnostics.
        report = args.bundle / "concurrency-results.txt"
        write_private(report, result.stdout + "\n" + result.stderr)
        if result.returncode: raise RuntimeError("Concurrency runner failed; review private concurrency-results.txt and development fixture cleanup")
        psql(connection, password, "BEGIN READ ONLY;" + empty_records_guard(names) + "ROLLBACK;")
        print("Concurrency schedules completed on development; verify output privately as described in README")
        return
    else:
        sql = state_guard(require_baseline=True) + "\n" + MIGRATION.read_text()
    psql(connection, password, sql, readonly=False)
    print(args.action + " completed on development only" + ("; schema and test records rolled back" if args.action == "rehearse" else ""))


if __name__ == "__main__":
    try: main()
    except (ValueError, RuntimeError, OSError, json.JSONDecodeError) as error:
        # Do not emit raw URLs/SQL/tracebacks or subprocess output.
        print("Stopped: " + (str(error) if isinstance(error, (ValueError, RuntimeError)) else "Local tool/file operation failed"), file=sys.stderr)
        sys.exit(1)

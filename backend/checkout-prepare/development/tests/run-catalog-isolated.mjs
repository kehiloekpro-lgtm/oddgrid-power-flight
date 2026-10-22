// Optional local runtime, never a hosted connection. Reuses the existing metadata fixture.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
const runtime = process.argv[2];
if (!runtime?.startsWith("/") || !runtime.endsWith("/@electric-sql/pglite/dist/index.js"))
  throw new Error("Pass an absolute local PGlite module path, never a database URL");
const { PGlite } = await import(pathToFileURL(runtime).href);
const db = new PGlite();
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const modulePath = fileURLToPath(new URL("../database_setup.py", import.meta.url));
function generated(operation, payload = null) {
  return execFileSync(
    "python3",
    [
      "-c",
      `import importlib.util,json,sys
spec=importlib.util.spec_from_file_location('setup',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
operation=sys.argv[2]
if operation=='attachments': print(m.managed_attachments(json.load(sys.stdin)))
if operation=='bridge': print("SELECT to_regprocedure('"+m.CONCURRENCY_BRIDGE+"') IS NOT NULL AS ready;")
if operation=='compare': print(m.assert_catalog_sql(json.load(sys.stdin)))
if operation=='rehearse':
 print('BEGIN;'+m.empty_records_guard(['public','private'])+(m.TESTS/'before-migration.sql').read_text()+m.transaction_body(m.MIGRATION.read_text(),'COMMIT')+"SET LOCAL oddgrid.supabase_development_test='yes';"+m.transaction_body((m.TESTS/'checkout.sql').read_text(),'ROLLBACK')+'ROLLBACK;')
`,
      modulePath,
      operation,
    ],
    { input: JSON.stringify(payload), encoding: "utf8" },
  );
}
try {
  await db.exec("SET oddgrid.isolated_test='yes';");
  await db.exec(read("../../tests/export-fixture.sql"));
  const query = read("../catalog.sql").replaceAll(":'schema_csv'", "'public,private'");
  // Test the managed attachment supplement without touching auth records.
  await db.exec(`BEGIN;
    CREATE FUNCTION public.phase3_auth_hook() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
    CREATE TRIGGER phase3_hook AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.phase3_auth_hook();
    ALTER TABLE auth.users ENABLE REPLICA TRIGGER phase3_hook;`);
  const hookResults = await db.exec(query.replace("BEGIN READ ONLY;", "").replace("COMMIT;", ""));
  const hooked = hookResults.find((r) => r.rows.length)?.rows[0].jsonb_build_object;
  assert.equal(hooked.managed_custom_triggers[0][4], "R");
  await db.exec("DROP TRIGGER phase3_hook ON auth.users;" + generated("attachments", hooked));
  assert.equal(
    (await db.query("SELECT tgenabled FROM pg_trigger WHERE tgname='phase3_hook'")).rows[0]
      .tgenabled,
    "R",
  );
  await db.exec("ROLLBACK;");
  const results = await db.exec(query);
  const source = results.find((r) => r.rows.length)?.rows[0].jsonb_build_object;
  assert.equal(source.auth_ready, true);
  assert(source.functions.length > 0);
  await db.exec("BEGIN;" + generated("compare", source) + "ROLLBACK;");
  const tampered = structuredClone(source);
  tampered.relations = [];
  await assert.rejects(
    db.exec("BEGIN;" + generated("compare", tampered) + "ROLLBACK;"),
    /differ from source/,
  );
  await db.exec("ROLLBACK;");
  await db.exec(generated("rehearse"));
  // Full rehearsal rolls back both migration and fixtures, including historical preservation seed.
  await db.exec("BEGIN;" + generated("compare", source) + "ROLLBACK;");
  assert.equal((await db.query("SELECT count(*)::int AS n FROM public.products")).rows[0].n, 0);
  await db.exec(read("../../migrations/20261021_001_secure_variant_checkout.sql"));
  assert.equal((await db.query(generated("bridge"))).rows[0].ready, true);
  console.log(
    "PASS: metadata inventory, atomic structural/ACL mismatch rejection and existing-suite rollback rehearsal in isolated PostgreSQL.",
  );
  console.log(
    "LIMIT: does not reproduce managed Supabase auth, external hooks, CLI dump/restore or multi-session concurrency.",
  );
} finally {
  await db.close();
}

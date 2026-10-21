// Optional test runtime only, NOT a storefront dependency.
// npm install --prefix /tmp/oddgrid-sql-runtime --no-package-lock --ignore-scripts @electric-sql/pglite
// node backend/checkout-prepare/tests/run-isolated.mjs /tmp/oddgrid-sql-runtime/node_modules/@electric-sql/pglite/dist/index.js
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const runtime = process.argv[2];
if (!runtime?.endsWith("/@electric-sql/pglite/dist/index.js"))
  throw new Error("Pass an absolute isolated PGlite runtime module path, never a database URL");
const { PGlite } = await import(pathToFileURL(runtime).href);
// In-memory PostgreSQL; cannot connect to the deployed project.
const db = new PGlite();
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
try {
  await db.exec("SET oddgrid.isolated_test='yes';");
  await db.exec(read("./export-fixture.sql"));
  await db.exec(read("./before-migration.sql"));
  const original = (
    await db.query(
      "SELECT pg_get_functiondef('private.finalize_order_from_payment(uuid)'::regprocedure) AS body",
    )
  ).rows[0].body;
  await db.exec(read("../migrations/20261021_001_secure_variant_checkout.sql"));
  const updated = (
    await db.query(
      "SELECT pg_get_functiondef('private.finalize_order_from_payment(uuid)'::regprocedure) AS body",
    )
  ).rows[0].body;
  // Every byte of the exported payment/finalization protection is unchanged except this projection.
  assert.equal(
    updated
      .replace(
        "        product_id,\n        variant_id,\n        variant_name,",
        "        product_id,",
      )
      .replace(
        "        ci.product_id,\n        ci.variant_id,\n        ci.variant_name,",
        "        ci.product_id,",
      ),
    original,
  );
  await db.exec(read("./checkout.sql"));
  console.log(
    "PASS: migration, historical preservation, SQL assertions, and unchanged finalization protections in isolated embedded PostgreSQL.",
  );
  console.log(
    "LIMIT: single embedded connection; multi-session concurrency and actual Supabase/RLS environment remain unverified.",
  );
} catch (error) {
  console.error("Isolated SQL test failed:", error.message, error.code ?? "");
  process.exitCode = 1;
} finally {
  await db.close();
}

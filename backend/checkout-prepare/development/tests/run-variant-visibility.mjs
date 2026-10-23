// Executes the proposed policy only in in-memory PostgreSQL, never a hosted URL.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const runtime = process.argv[2];
if (!runtime?.startsWith("/") || !runtime.endsWith("/@electric-sql/pglite/dist/index.js"))
  throw new Error("Pass an isolated PGlite module path");
const { PGlite } = await import(pathToFileURL(runtime).href);
const db = new PGlite();
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
    GRANT USAGE ON SCHEMA public TO anon,authenticated;
    CREATE TABLE public.products(id uuid PRIMARY KEY,status text,sale_type text,availability text,currency text);
    CREATE TABLE public.product_variants(id uuid PRIMARY KEY,product_id uuid,variant_name text,is_active boolean,availability text,selling_price numeric,currency text);
    GRANT SELECT ON public.products,public.product_variants TO anon,authenticated;
    ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Public can read active products" ON public.products FOR SELECT TO anon,authenticated USING(status='active');
    ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
    INSERT INTO public.products VALUES ('10000000-0000-4000-8000-000000000001','active','direct','confirmed_available','USD');
    INSERT INTO public.product_variants VALUES ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Eligible',true,'confirmed_available',300,'USD');
    SET ROLE anon;`);
  assert.equal(
    (await db.query("SELECT count(*)::int n FROM public.product_variants")).rows[0].n,
    0,
  );
  await db.exec("RESET ROLE;");
  await db.exec(
    readFileSync(
      new URL("../../production/variant-read-policy-review.sql", import.meta.url),
      "utf8",
    ),
  );
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`SET ROLE ${role};`);
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM public.product_variants")).rows[0].n,
      1,
    );
    await assert.rejects(
      db.exec("UPDATE public.product_variants SET selling_price=1"),
      /permission denied/,
    );
    await db.exec("RESET ROLE;");
  }
  const denied = [
    "UPDATE public.product_variants SET is_active=false",
    "UPDATE public.product_variants SET availability='available_to_order'",
    "UPDATE public.product_variants SET selling_price=NULL",
    "UPDATE public.product_variants SET selling_price='NaN'::numeric",
    "UPDATE public.product_variants SET currency='ZAR'",
    "UPDATE public.product_variants SET product_id='10000000-0000-4000-8000-000000000099'",
    "UPDATE public.products SET status='draft'",
    "UPDATE public.products SET sale_type='rfq'",
    "UPDATE public.products SET availability='available_to_order'",
  ];
  for (const mutation of denied) {
    await db.exec(`BEGIN; ${mutation}; SET LOCAL ROLE anon;`);
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM public.product_variants")).rows[0].n,
      0,
    );
    await db.exec("ROLLBACK;");
  }
  console.log(
    "PASS: proposed variant SELECT policy exposes eligible configured products; rejects draft/RFQ/unavailable/inactive/unpriced/mismatched variants and all browser writes.",
  );
} finally {
  await db.close();
}

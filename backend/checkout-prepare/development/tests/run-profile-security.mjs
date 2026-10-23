// Isolated metadata-derived profile fixture. Executes the actual reviewed migration.
// Not a complete Supabase replica; never accepts a database URL or real credentials.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const runtime = process.argv[2];
if (!runtime?.startsWith("/") || !runtime.endsWith("/@electric-sql/pglite/dist/index.js"))
  throw new Error("Pass an isolated PGlite runtime path, never a connection URL");
const { PGlite } = await import(pathToFileURL(runtime).href);
const db = new PGlite();
const migration = readFileSync(
  new URL("../../migrations/20261023_002_protect_profile_role.sql", import.meta.url),
  "utf8",
);
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    GRANT USAGE ON SCHEMA auth,private,public TO authenticated,service_role;
    CREATE TYPE public.app_role AS ENUM ('customer','staff','admin');
    CREATE TABLE public.profiles(id uuid PRIMARY KEY,role public.app_role NOT NULL DEFAULT 'customer',
      first_name text,last_name text,phone text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
    GRANT SELECT,UPDATE ON public.profiles TO anon,authenticated,service_role;
    CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT TO authenticated USING(id=auth.uid());
    CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING(id=auth.uid()) WITH CHECK(id=auth.uid());
    CREATE FUNCTION private.is_staff_or_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS
      $$SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('staff','admin'))$$;
    CREATE FUNCTION public.test_reject(sql text) RETURNS void LANGUAGE plpgsql AS $$BEGIN
      BEGIN EXECUTE sql; EXCEPTION WHEN insufficient_privilege THEN RETURN; END;
      RAISE EXCEPTION 'Expected insufficient privilege'; END$$;
  `);
  const before = (
    await db.query("SELECT pg_get_functiondef('private.is_staff_or_admin()'::regprocedure) body")
  ).rows[0].body;
  await db.exec(`BEGIN; ${migration} COMMIT;`);
  await db.exec(`BEGIN;
    INSERT INTO public.profiles(id) VALUES ('71000000-0000-4000-8000-000000000001'),('71000000-0000-4000-8000-000000000002');
    SET LOCAL request.jwt.claim.sub='71000000-0000-4000-8000-000000000001';
    SET LOCAL ROLE authenticated;
    SELECT public.test_reject($q$UPDATE public.profiles SET role='staff' WHERE id=auth.uid()$q$);
    SELECT public.test_reject($q$UPDATE public.profiles SET role='admin' WHERE id=auth.uid()$q$);
    SELECT public.test_reject($q$UPDATE public.profiles SET id=gen_random_uuid() WHERE id=auth.uid()$q$);
    SELECT public.test_reject($q$UPDATE public.profiles SET created_at=now() WHERE id=auth.uid()$q$);
    SELECT public.test_reject($q$UPDATE public.profiles SET updated_at=now() WHERE id=auth.uid()$q$);
    UPDATE public.profiles SET first_name='Allowed',last_name='Customer',phone='test' WHERE id=auth.uid();
    UPDATE public.profiles SET first_name='Foreign edit' WHERE id='71000000-0000-4000-8000-000000000002';
    RESET ROLE;
  `);
  assert.equal((await db.query("SELECT private.is_staff_or_admin() staff")).rows[0].staff, false);
  assert.equal(
    (
      await db.query(
        "SELECT first_name FROM public.profiles WHERE id='71000000-0000-4000-8000-000000000001'",
      )
    ).rows[0].first_name,
    "Allowed",
  );
  assert.equal(
    (
      await db.query(
        "SELECT first_name FROM public.profiles WHERE id='71000000-0000-4000-8000-000000000002'",
      )
    ).rows[0].first_name,
    null,
  );
  await db.exec(
    `SET LOCAL ROLE service_role; UPDATE public.profiles SET role='staff' WHERE id='71000000-0000-4000-8000-000000000001'; RESET ROLE;`,
  );
  assert.equal((await db.query("SELECT private.is_staff_or_admin() staff")).rows[0].staff, true);
  assert.equal(
    (await db.query("SELECT pg_get_functiondef('private.is_staff_or_admin()'::regprocedure) body"))
      .rows[0].body,
    before,
  );
  await db.exec("ROLLBACK;");
  assert.equal((await db.query("SELECT count(*)::int n FROM public.profiles")).rows[0].n, 0);
  console.log(
    "PASS: actual profile migration; denied role/id/timestamp edits, allowed own fields, denied foreign edit, trusted provisioning, unchanged helper and fixture rollback.",
  );
} finally {
  await db.close();
}

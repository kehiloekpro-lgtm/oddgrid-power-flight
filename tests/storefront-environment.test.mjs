import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source = ts.transpileModule(readFileSync("src/lib/storefront-environment.ts", "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const env = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

test("ordinary builds retain the original Production endpoint", () => {
  assert.equal(env.storefrontSupabaseUrl(false), env.ODDGRID_PRODUCTION_URL);
  assert.equal(env.storefrontSupabaseUrl(true), env.ODDGRID_PRODUCTION_URL);
});
test("only explicit local development can select the exact Development project", () => {
  assert.equal(
    env.storefrontSupabaseUrl(true, env.ODDGRID_DEVELOPMENT_URL),
    env.ODDGRID_DEVELOPMENT_URL,
  );
  assert.throws(() => env.storefrontSupabaseUrl(false, env.ODDGRID_DEVELOPMENT_URL));
});
test("untrusted endpoints, credentials, paths and production overrides fail closed", () => {
  for (const url of [
    "https://example.test",
    "http://ogbnpvroaafgpnlxeftw.supabase.co",
    `${env.ODDGRID_DEVELOPMENT_URL}?secret=value`,
    `${env.ODDGRID_DEVELOPMENT_URL}/rest/v1`,
    "https://user:secret@ogbnpvroaafgpnlxeftw.supabase.co",
    env.ODDGRID_PRODUCTION_URL,
  ])
    assert.throws(() => env.storefrontSupabaseUrl(true, url));
});

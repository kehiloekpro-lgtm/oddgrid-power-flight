import { test } from "node:test";
import assert from "node:assert/strict";
import { moduleUrl } from "./purchasing-modules.mjs";
const { developmentConfiguration, developmentGateway } = await import(
  moduleUrl("backend/development/config.ts")
);
const valid = {
  SUPABASE_URL: "https://ogbnpvroaafgpnlxeftw.supabase.co",
  ODDGRID_DEVELOPMENT_PURCHASING_APPROVED: "ogbnpvroaafgpnlxeftw",
  ODDGRID_DEVELOPMENT_PUBLISHABLE_KEY: "test-public-key",
  ODDGRID_DEVELOPMENT_ORIGINS: "http://localhost:5173",
};
const config = (value) => developmentConfiguration((name) => value[name]);
test("Development entry rejects Production, absent approval, wildcard and Production origins", () => {
  for (const patch of [
    { SUPABASE_URL: "https://izixhjstwfgywbgrnrey.supabase.co" },
    { ODDGRID_DEVELOPMENT_PURCHASING_APPROVED: "" },
    { ODDGRID_DEVELOPMENT_ORIGINS: "*" },
    { ODDGRID_DEVELOPMENT_ORIGINS: "https://oddgrid.co.za" },
    { ODDGRID_DEVELOPMENT_ORIGINS: "https://example.test/path" },
  ])
    assert.throws(() => config({ ...valid, ...patch }));
  assert.deepEqual(config(valid).origins, ["http://localhost:5173"]);
});
test("Development gateway rejects unexpected origins and missing keys; allows preflight", () => {
  const c = config(valid),
    request = (origin, method = "POST", key = "test-public-key") =>
      new Request("https://isolated.test", { method, headers: { Origin: origin, apikey: key } });
  assert.equal(developmentGateway(request("https://evil.test"), c).status, 403);
  assert.equal(developmentGateway(request("http://localhost:5173", "POST", ""), c).status, 401);
  assert.equal(developmentGateway(request("http://localhost:5173"), c), null);
  assert.equal(developmentGateway(request("http://localhost:5173", "OPTIONS", ""), c), null);
});

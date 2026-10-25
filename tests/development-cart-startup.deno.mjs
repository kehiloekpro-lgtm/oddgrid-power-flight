// Execute the real bundle/native SDK; no listening socket, secrets or network.
const path = Deno.args[0];
if (!path?.startsWith("/")) throw Error("Absolute local bundle path required");
let handler;
let fetches = 0;
globalThis.fetch = () => { fetches++; throw Error("Unexpected network request"); };
const env = {
  SUPABASE_URL: "https://ogbnpvroaafgpnlxeftw.supabase.co",
  ODDGRID_DEVELOPMENT_PURCHASING_APPROVED: "ogbnpvroaafgpnlxeftw",
  ODDGRID_DEVELOPMENT_ORIGINS: "http://localhost:5173",
  ODDGRID_DEVELOPMENT_PUBLISHABLE_KEY: "isolated-public-key",
  SUPABASE_SERVICE_ROLE_KEY: "isolated-not-a-credential",
};
Deno.env.get = (name) => env[name];
Deno.serve = (value) => { handler = value; };
await import(new URL(`file://${path}`).href);
if (typeof handler !== "function") throw Error("Entrypoint did not initialize");
const assert = (value, message) => { if (!value) throw Error(message); };
const cases = [
  ["approved OPTIONS", "OPTIONS", undefined, 204, {}],
  ["Production origin", "OPTIONS", undefined, 403, { Origin: "https://oddgrid.co.za" }],
  ["missing key", "POST", "{}", 401, { apikey: "" }],
  ["wrong key", "POST", "{}", 401, { apikey: "wrong" }],
  ["unsupported method", "GET", undefined, 405, {}],
  ["non JSON", "POST", "{}", 415, { "Content-Type": "text/plain" }],
  ["malformed JSON", "POST", "{", 400, {}],
  ["invalid action", "POST", "{}", 400, {}],
  ["oversized body", "POST", "x".repeat(9000), 413, {}],
  ["unapproved origin", "POST", "{}", 403, { Origin: "https://unapproved.invalid" }],
];
for (const [name, method, body, expected, extra] of cases) {
  const headers = { Origin: "http://localhost:5173", apikey: "isolated-public-key",
    "Content-Type": "application/json", ...extra };
  const response = await handler(new Request("http://isolated.invalid/cart-api", { method, headers, body }));
  assert(response.status === expected, `${name}: expected ${expected}, got ${response.status}`);
  const origin = response.headers.get("Access-Control-Allow-Origin");
  assert(origin !== "*", `${name}: wildcard CORS`);
  assert(origin === (headers.Origin === "http://localhost:5173" ? headers.Origin : null), `${name}: wrong origin`);
  assert(response.headers.get("Cache-Control") === "no-store", `${name}: cache policy`);
  if (method === "OPTIONS" && expected === 204) {
    assert(response.headers.get("Access-Control-Allow-Methods")?.includes("POST"), "missing allowed method");
    assert(response.headers.get("Access-Control-Allow-Headers")?.includes("apikey"), "missing allowed header");
    assert(await response.text() === "", "preflight body must be empty");
  }
  console.log(`PASS ${name}`);
}
assert(fetches === 0, "Network access attempted");
delete env.SUPABASE_SERVICE_ROLE_KEY;
const disabled = await handler(new Request("http://isolated.invalid/cart-api", { method: "OPTIONS" }));
assert(disabled.status === 503, "Missing privileged configuration must fail closed");
console.log("PASS missing configuration fails closed; no network or hosted writes");

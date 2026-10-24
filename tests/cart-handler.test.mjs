import { test } from "node:test";
import assert from "node:assert/strict";
import { moduleUrl } from "./purchasing-modules.mjs";
const { handleGuestCart } = await import(moduleUrl("backend/cart/handler.ts"));
const origin = "http://localhost:5173";
const options = {
  allowedOrigins: [origin],
  client: {
    from() {
      throw Error("Database must not be reached");
    },
  },
};
const request = (body, headers = {}, method = "POST") =>
  new Request(origin, {
    method,
    headers: { Origin: origin, "Content-Type": "application/json", ...headers },
    ...(body === undefined ? {} : { body }),
  });
test("cart CORS and method checks do not touch database", async () => {
  assert.equal((await handleGuestCart(request(undefined, {}, "OPTIONS"), options)).status, 204);
  assert.equal((await handleGuestCart(request(undefined, {}, "GET"), options)).status, 405);
  const response = await handleGuestCart(request("{}", { Origin: "https://evil.test" }), options);
  assert.equal(response.status, 403);
  assert.equal(response.headers.has("Access-Control-Allow-Origin"), false);
});
test("cart validates JSON, size, action and both guest credentials before lookup", async () => {
  for (const [body, headers, status] of [
    ["{}", { "Content-Type": "text/plain" }, 415],
    ["{", {}, 400],
    ["x".repeat(8193), {}, 413],
    ["[]", {}, 400],
    [JSON.stringify({ action: "unknown" }), {}, 400],
    [JSON.stringify({ action: "get_guest_cart", cart_id: "bad" }), {}, 400],
  ]) {
    const response = await handleGuestCart(request(body, headers), options);
    assert.equal(response.status, status);
    assert.doesNotMatch(await response.text(), /diagnostic|Database must|service_role|stack/i);
  }
});

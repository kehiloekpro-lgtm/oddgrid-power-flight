import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const dataUrl = (text) => `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`;
const compile = (text) =>
  ts.transpileModule(text, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
const source = (path) => readFileSync(path, "utf8");
const contractUrl = dataUrl(compile(source("src/lib/checkout-contract.ts")));
const pricingUrl = dataUrl(compile(source("backend/checkout-prepare/pricing.ts")));
const { snapshotCart } = await import(pricingUrl);
const { handleCheckoutPrepare } = await import(
  dataUrl(
    compile(
      source("backend/checkout-prepare/handler.ts")
        .replace('"../../src/lib/checkout-contract.ts"', JSON.stringify(contractUrl))
        .replace('"./pricing.ts"', JSON.stringify(pricingUrl)),
    ),
  )
);
const guestUrl = dataUrl(
  'export const getGuestCartCredentialsForCheckout=()=>null; export const getGuestCartSnapshot=()=>({status:"idle"});',
);
const configUrl = dataUrl(
  'export const SUPABASE_URL="https://example.test"; export const SUPABASE_PUBLISHABLE_KEY="test-public-key";',
);
const { createCheckoutPreparationClient, prepareGuestCheckout } = await import(
  dataUrl(
    compile(
      source("src/lib/checkout-prepare.ts")
        .replace('"./checkout-contract"', JSON.stringify(contractUrl))
        .replace('"./guest-cart"', JSON.stringify(guestUrl))
        .replace('"./supabase-config"', JSON.stringify(configUrl))
        .replace("import.meta.env.DEV", "false"),
    ),
  )
);
const uuid = (n) => `${String(n).padStart(8, "0")}-1111-4111-8111-111111111111`;
const details = {
  email: "guest@example.test",
  phone: "+27110000000",
  shipping_recipient_name: "Guest",
  shipping_phone: "+27110000000",
  shipping_line1: "Test address",
  shipping_line2: "",
  shipping_city: "Test city",
  shipping_region: "Test region",
  shipping_postal_code: "0000",
  shipping_country_code: "ZA",
};
const credentials = { cart_id: uuid(1), guest_token: uuid(2) };
const requestBody = { ...details, ...credentials, idempotency_key: uuid(3) };
const product = {
  id: uuid(4),
  name: "Isolated fixture",
  sku: "PARENT",
  currency: "USD",
  selling_price: "100.00",
  status: "active",
  sale_type: "direct",
  availability: "confirmed_available",
};
const item = { product_id: product.id, variant_id: null, quantity: 2 };
const variant = {
  id: uuid(5),
  product_id: product.id,
  variant_name: "Selected configuration",
  sku: "VARIANT",
  currency: "USD",
  selling_price: "175.25",
  availability: "confirmed_available",
  is_active: true,
};
const session = {
  id: uuid(6),
  cart_id: credentials.cart_id,
  currency: "USD",
  expires_at: new Date(Date.now() + 1800000).toISOString(),
  subtotal: "200.00",
  shipping_amount: "0.00",
  tax_amount: "0.00",
  discount_amount: "0.00",
  total_amount: "200.00",
};
const req = (body = requestBody, origin = "http://localhost:5173") =>
  new Request("https://example.test/functions/v1/checkout-prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(body),
  });
function backendFixture() {
  const cart = {
    id: credentials.cart_id,
    currency: "USD",
    status: "active",
    expiresAt: session.expires_at,
    items: [{ ...item }],
    products: [{ ...product }],
    variants: [],
  };
  const calls = [];
  const cache = new Map();
  const backend = {
    async authorizeGuestCart(id, token) {
      calls.push(["authorize", id, token]);
      return id === credentials.cart_id && token === credentials.guest_token ? cart : null;
    },
    async prepare(request) {
      calls.push(["prepare", request]);
      // Isolated adapter contract mock, not evidence about the deployed RPC.
      if (cache.has(request.idempotency_key)) {
        const prior = cache.get(request.idempotency_key);
        if (prior.cart_id !== request.cart_id) throw new Error("foreign request key");
        return prior;
      }
      const amount = snapshotCart(cart.items, cart.products, cart.variants, cart.currency).subtotal;
      const result = { ...session, subtotal: amount, total_amount: amount };
      cache.set(request.idempotency_key, result);
      return result;
    },
  };
  return {
    cart,
    calls,
    cache,
    backend,
    options: {
      enabled: true,
      contractsReviewed: true,
      allowedOrigins: ["http://localhost:5173"],
      backend,
    },
  };
}
test("staged endpoint stays unavailable, even with a backend bound, until both gates pass", async () => {
  const f = backendFixture();
  for (const gate of [{ enabled: false }, { contractsReviewed: false }, { backend: null }]) {
    assert.equal((await handleCheckoutPrepare(req(), { ...f.options, ...gate })).status, 503);
  }
  assert.equal(f.calls.length, 0);
});
test("valid guest authorization sends both credentials and returns only authoritative session fields", async () => {
  const f = backendFixture();
  const result = await handleCheckoutPrepare(req(), f.options);
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(body.checkout.total_amount, "200.00");
  assert.equal(body.payment_initiated, false);
  assert.deepEqual(f.calls[0], ["authorize", credentials.cart_id, credentials.guest_token]);
  assert.equal(body.checkout.guest_token, undefined);
  assert.equal(f.calls.filter((c) => c[0] === "prepare").length, 1);
});
test("foreign/nonexistent guest credentials rejected without preparing or revealing a checkout", async () => {
  const f = backendFixture();
  for (const body of [
    { ...requestBody, guest_token: uuid(20) },
    { ...requestBody, cart_id: uuid(21) },
  ]) {
    const result = await handleCheckoutPrepare(req(body), f.options);
    assert.equal(result.status, 404);
    assert.deepEqual(await result.json(), { error: "Cart not found or unauthorized" });
  }
  assert.equal(
    f.calls.some((c) => c[0] === "prepare"),
    false,
  );
});
test("empty, inactive, expired and unknown-expiry carts never prepare", async () => {
  for (const overrides of [
    { items: [] },
    { status: "converted" },
    { expiresAt: new Date(0).toISOString() },
    { expiresAt: "unknown" },
  ]) {
    const f = backendFixture();
    Object.assign(f.cart, overrides);
    assert.equal((await handleCheckoutPrepare(req(), f.options)).status, 409);
    assert.equal(
      f.calls.some((c) => c[0] === "prepare"),
      false,
    );
  }
});
test("standard pricing uses authoritative parent price and exact integer cents", () => {
  assert.deepEqual(snapshotCart([item], [product], [], "USD"), {
    subtotal: "200.00",
    items: [
      {
        ...item,
        product_name: product.name,
        variant_name: null,
        product_sku: "PARENT",
        unit_price: "100.00",
        line_total: "200.00",
      },
    ],
  });
  assert.equal(
    snapshotCart([{ ...item, quantity: 3 }], [{ ...product, selling_price: "0.10" }], [], "USD")
      .subtotal,
    "0.30",
  );
});
test("variant identity, configuration and SKU persist, variant price overrides parent", async () => {
  const f = backendFixture();
  f.cart.items[0].variant_id = variant.id;
  f.cart.variants = [variant];
  const snapshot = snapshotCart(f.cart.items, f.cart.products, f.cart.variants, "USD");
  assert.equal(snapshot.subtotal, "350.50");
  assert.equal(snapshot.items[0].variant_id, variant.id);
  assert.equal(snapshot.items[0].variant_name, variant.variant_name);
  assert.equal(snapshot.items[0].product_sku, "VARIANT");
  assert.equal(snapshot.items[0].unit_price, "175.25");
  const response = await handleCheckoutPrepare(req(), f.options);
  assert.equal((await response.json()).checkout.total_amount, "350.50");
});
test("invalid variant, mismatch, missing selection, inactive/unavailable/unpriced variant rejected", () => {
  const selected = { ...item, variant_id: variant.id };
  for (const variants of [
    [],
    [{ ...variant, product_id: uuid(30) }],
    [{ ...variant, is_active: false }],
    [{ ...variant, availability: "available_to_order" }],
    [{ ...variant, selling_price: null }],
    [{ ...variant, selling_price: "0.00" }],
  ]) {
    assert.throws(() => snapshotCart([selected], [product], variants, "USD"));
  }
  assert.throws(() => snapshotCart([item], [product], [variant], "USD"), /configuration/);
});
test("product, variant and cart currencies must all agree", () => {
  const selected = { ...item, variant_id: variant.id };
  assert.throws(() =>
    snapshotCart([selected], [{ ...product, currency: "ZAR" }], [variant], "USD"),
  );
  assert.throws(() =>
    snapshotCart([selected], [product], [{ ...variant, currency: "ZAR" }], "USD"),
  );
  assert.throws(() => snapshotCart([selected], [product], [variant], "ZAR"));
});
test("RFQ/draft/unconfirmed products, unsafe prices and quantities rejected", () => {
  for (const override of [
    { sale_type: "rfq" },
    { status: "draft" },
    { availability: "available_to_order" },
    { selling_price: -1 },
    { selling_price: NaN },
    { selling_price: Infinity },
    { selling_price: "1.001" },
  ])
    assert.throws(() => snapshotCart([item], [{ ...product, ...override }], [], "USD"));
  for (const quantity of [0, 101, 1.2])
    assert.throws(() => snapshotCart([{ ...item, quantity }], [product], [], "USD"));
});
test("untrusted prices, missing tokens and malformed data rejected before backend access", async () => {
  const f = backendFixture();
  for (const body of [
    { ...requestBody, total_amount: "1.00" },
    { ...requestBody, items: [item] },
    { ...requestBody, guest_token: null },
    { ...requestBody, idempotency_key: "bad" },
    { ...requestBody, email: "bad" },
    [],
  ])
    assert.equal((await handleCheckoutPrepare(req(body), f.options)).status, 400);
  assert.equal(f.calls.length, 0);
});
test("CORS, preflight, methods and request-size limits", async () => {
  const f = backendFixture();
  assert.equal(
    (await handleCheckoutPrepare(req(requestBody, "https://foreign.test"), f.options)).status,
    403,
  );
  const response = await handleCheckoutPrepare(
    new Request("https://example.test", {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:5173" },
    }),
    f.options,
  );
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "http://localhost:5173");
  assert.equal(
    (await handleCheckoutPrepare(new Request("https://example.test"), f.options)).status,
    405,
  );
  assert.equal(
    (await handleCheckoutPrepare(req({ ...requestBody, email: "a".repeat(9000) }), f.options))
      .status,
    413,
  );
});
test("duplicate request preserves adapter idempotency UUID; foreign idempotency result never leaks", async () => {
  const f = backendFixture();
  const [a, b] = await Promise.all([
    handleCheckoutPrepare(req(), f.options),
    handleCheckoutPrepare(req(), f.options),
  ]);
  assert.deepEqual(await a.json(), await b.json());
  assert.equal(f.cache.size, 1);
  f.cache.set(requestBody.idempotency_key, { ...session, cart_id: uuid(50) });
  const result = await handleCheckoutPrepare(req(), f.options);
  assert.equal(result.status, 503);
  assert.equal((await result.json()).checkout, undefined);
});
test("backend failures are generic and never include customer information or secrets", async () => {
  const f = backendFixture();
  f.backend.prepare = async () => {
    throw new Error("private service secret and guest address");
  };
  const response = await handleCheckoutPrepare(req(), f.options);
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /secret|address/);
});
function clientFixture() {
  let current = { ...credentials };
  let items = [{ ...item }];
  const calls = [];
  const storage = new Map();
  let outcome = () =>
    Promise.resolve(new Response(JSON.stringify({ checkout: session, payment_initiated: false })));
  const options = {
    development: true,
    contractReviewed: true,
    key: "public-test",
    endpoint: "https://example.test/functions/v1/checkout-prepare",
    credentials: () => current,
    cart: () => ({ currency: "USD", items }),
    storage: () => ({
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    }),
    request: async (url, init) => {
      calls.push([url, JSON.parse(init.body)]);
      return outcome();
    },
  };
  return {
    options,
    calls,
    storage,
    setCredentials: (value) => {
      current = value;
    },
    setItems: (value) => {
      items = value;
    },
    setOutcome: (value) => {
      outcome = value;
    },
    client: createCheckoutPreparationClient(options),
  };
}
test("browser default stays closed; production and unreviewed clients send no requests", async () => {
  await assert.rejects(prepareGuestCheckout(details), /not available/);
  const f = clientFixture();
  for (const gate of [{ development: false }, { contractReviewed: false }])
    await assert.rejects(
      createCheckoutPreparationClient({ ...f.options, ...gate })(details),
      /not available/,
    );
  assert.equal(f.calls.length, 0);
});
test("client sends guest credentials and shipping only; success is server confirmed and allowlisted", async () => {
  const f = clientFixture();
  f.setOutcome(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          checkout: { ...session, payment_url: "https://forbidden.test", guest_token: "private" },
          payment_initiated: false,
        }),
      ),
    ),
  );
  const result = await f.client(details);
  assert.equal(result.total_amount, session.total_amount);
  assert.equal(result.payment_url, undefined);
  assert.equal(result.guest_token, undefined);
  assert.equal(f.calls[0][1].guest_token, credentials.guest_token);
  assert.equal(f.calls[0][1].total_amount, undefined);
  assert.equal(f.calls[0][1].items, undefined);
  assert.doesNotMatch(JSON.stringify([...f.storage]), /guest@example|Test address/);
});
test("client idempotency survives refresh and uncertain failures; no automatic retry", async () => {
  const f = clientFixture();
  f.setOutcome(() => Promise.reject(new Error("network")));
  await assert.rejects(f.client(details), /No automatic retry/);
  assert.equal(f.calls.length, 1);
  const restored = createCheckoutPreparationClient(f.options);
  await assert.rejects(restored(details), /No automatic retry/);
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0][1].idempotency_key, f.calls[1][1].idempotency_key);
});
test("repeated clicks cannot submit concurrent checkout requests", async () => {
  const f = clientFixture();
  let release;
  const barrier = new Promise((resolve) => {
    release = resolve;
  });
  f.setOutcome(() => barrier);
  const first = f.client(details);
  await assert.rejects(f.client(details), /already in progress/);
  while (!f.calls.length) await new Promise((resolve) => setImmediate(resolve));
  release(new Response(JSON.stringify({ checkout: session, payment_initiated: false })));
  await first;
  assert.equal(f.calls.length, 1);
});
test("disabled endpoint, rejected writes and malformed success never display prepared session", async () => {
  for (const [status, payload] of [
    [503, { error: "Checkout is not available yet" }],
    [409, { error: "Cart is expired" }],
    [500, { error: "server" }],
    [200, { checkout: session, payment_initiated: true }],
    [200, { checkout: { ...session, cart_id: uuid(70) }, payment_initiated: false }],
    [200, { checkout: { ...session, total_amount: "NaN" }, payment_initiated: false }],
  ]) {
    const f = clientFixture();
    f.setOutcome(() => Promise.resolve(new Response(JSON.stringify(payload), { status })));
    await assert.rejects(f.client(details));
    assert.equal(f.calls.length, 1);
  }
});
test("empty and inaccessible guest session never submits checkout", async () => {
  const f = clientFixture();
  f.setItems([]);
  await assert.rejects(f.client(details), /empty or expired/);
  assert.equal(f.calls.length, 0);
  f.setItems([item]);
  f.setCredentials(null);
  await assert.rejects(f.client(details));
  assert.equal(f.calls.length, 0);
});
test("in-flight response from an old guest session is discarded", async () => {
  const f = clientFixture();
  let release;
  const barrier = new Promise((resolve) => {
    release = resolve;
  });
  f.setOutcome(() => barrier);
  const promise = f.client(details);
  while (!f.calls.length) await new Promise((resolve) => setImmediate(resolve));
  f.setCredentials({ cart_id: uuid(80), guest_token: uuid(81) });
  release(new Response(JSON.stringify({ checkout: session, payment_initiated: false })));
  await assert.rejects(promise, /session changed/);
});
test("checkout code has no executable payment or finalization paths; default Edge entry stays closed", () => {
  for (const path of [
    "backend/checkout-prepare/handler.ts",
    "backend/checkout-prepare/index.ts",
    "src/lib/checkout-prepare.ts",
    "src/routes/checkout.tsx",
  ])
    assert.doesNotMatch(
      source(path),
      /create_payment_attempt|finalize_order_from_payment|paypal|payments\s*\(|\.rpc\(/i,
    );
  assert.match(source("backend/checkout-prepare/index.ts"), /enabled: false/);
  assert.match(source("backend/checkout-prepare/index.ts"), /backend: null/);
  assert.match(source("src/routes/checkout.tsx"), /import.meta.env.DEV/);
});

test("cart changes during an in-flight checkout discard its response", async () => {
  const f = clientFixture();
  let release;
  const barrier = new Promise((resolve) => {
    release = resolve;
  });
  f.setOutcome(() => barrier);
  const pending = f.client(details);
  while (!f.calls.length) await new Promise((resolve) => setImmediate(resolve));
  f.setItems([{ ...item, quantity: 3 }]);
  release(new Response(JSON.stringify({ checkout: session, payment_initiated: false })));
  await assert.rejects(pending, /session changed/);
});

test("changed contact information or credentials never reuse another checkout intent UUID", async () => {
  const f = clientFixture();
  await f.client(details);
  await f.client({ ...details, shipping_city: "Changed city" });
  assert.notEqual(f.calls[0][1].idempotency_key, f.calls[1][1].idempotency_key);
  f.setCredentials({ ...credentials, guest_token: uuid(99) });
  await f.client(details);
  assert.notEqual(f.calls[0][1].idempotency_key, f.calls[2][1].idempotency_key);
});

test("expired prepared sessions are rejected even after an HTTP success", async () => {
  const f = clientFixture();
  f.setOutcome(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          checkout: { ...session, expires_at: new Date(0).toISOString() },
          payment_initiated: false,
        }),
      ),
    ),
  );
  await assert.rejects(f.client(details), /not confirmed/);
});

test("lower-priced variant and missing variant SKU never fall back to parent snapshots", () => {
  const result = snapshotCart(
    [{ ...item, variant_id: variant.id }],
    [product],
    [{ ...variant, selling_price: "25.50", sku: null }],
    "USD",
  );
  assert.equal(result.subtotal, "51.00");
  assert.equal(result.items[0].unit_price, "25.50");
  assert.equal(result.items[0].product_sku, null);
  assert.equal(result.items[0].variant_id, variant.id);
});

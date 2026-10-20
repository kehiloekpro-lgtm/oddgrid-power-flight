// Run with: node --test tests/guest-cart.test.mjs (after installing dependencies).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const uuid = (n) => `${String(n).padStart(8, "0")}-1111-4111-8111-111111111111`;
const credentials = { cart_id: uuid(1), guest_token: uuid(2) };
const cart = { id: credentials.cart_id, currency: "USD", status: "active" };
const item = { id: uuid(3), product_id: uuid(4), variant_id: null, quantity: 2 };
const product = {
  id: item.product_id,
  slug: "power-station",
  name: "Power station",
  selling_price: 250,
  currency: "USD",
  status: "active",
  sale_type: "direct",
  availability: "confirmed_available",
};
const key = "oddgrid-guest-cart";
const url = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
const config = url(
  'export const SUPABASE_PUBLISHABLE_KEY="test-public-key"; export const SUPABASE_URL="https://example.test"; export const DEMO_REFRIGERATOR={id:"a0119f06-dc03-405e-92bb-def23ad7d3e8",slug:"solar-fridge-210l"};',
);
const products = url(
  compile(
    readFileSync(new URL("../src/lib/supabase-products.ts", import.meta.url), "utf8").replace(
      '"./supabase-config"',
      JSON.stringify(config),
    ),
  ),
);
let serial = 0;
async function fixture(saved = credentials) {
  const storage = new Map(saved ? [[key, JSON.stringify(saved)]] : []);
  globalThis.sessionStorage = {
    getItem: (k) => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, v),
    removeItem: (k) => storage.delete(k),
  };
  const calls = [];
  const state = {
    items: [structuredClone(item)],
    fail: null,
    hold: null,
    variant: null,
    rejectRefresh: false,
  };
  globalThis.fetch = async (endpoint, options = {}) => {
    const target = new URL(endpoint);
    if (target.pathname.includes("/rest/v1/")) {
      return new Response(
        JSON.stringify(
          target.pathname.endsWith("product_variants")
            ? state.variant
              ? [state.variant]
              : []
            : [product],
        ),
      );
    }
    const body = JSON.parse(options.body);
    calls.push(body);
    if (state.hold) await state.hold;
    if (state.fail) {
      const failure = state.fail;
      if (failure instanceof Error) throw failure;
      return new Response(JSON.stringify(failure.body), { status: failure.status });
    }
    if (body.action === "create_guest_cart")
      return new Response(
        JSON.stringify({
          cart: { ...cart, currency: body.currency },
          guest_token: credentials.guest_token,
        }),
        { status: 201 },
      );
    // Ownership applies before every cart operation, as in the saved Edge Function.
    if (body.cart_id !== credentials.cart_id || body.guest_token !== credentials.guest_token)
      return new Response(JSON.stringify({ error: "Cart not found or unauthorized" }), {
        status: 404,
      });
    if (body.action === "get_guest_cart") {
      if (state.rejectRefresh) throw new Error("network");
      return new Response(JSON.stringify({ cart, items: state.items }));
    }
    if (body.action === "remove_item")
      state.items = state.items.filter((i) => i.id !== body.item_id);
    if (body.action === "update_quantity")
      state.items = state.items.map((i) =>
        i.id === body.item_id ? { ...i, quantity: body.quantity } : i,
      );
    if (body.action === "add_item") state.items[0].quantity += body.quantity;
    return new Response(
      JSON.stringify({
        success: true,
        action: body.action,
        item_id: item.id,
        ...(body.action === "remove_item" ? {} : { quantity: state.items[0].quantity }),
      }),
    );
  };
  const source = readFileSync(new URL("../src/lib/guest-cart.ts", import.meta.url), "utf8")
    .replace('"./supabase-config"', JSON.stringify(config))
    .replace('"./supabase-products"', JSON.stringify(products));
  const service = await import(url(compile(source) + `\n// isolated browser session ${serial++}`));
  return { service, storage, calls, state };
}

test("no saved cart renders an empty state without creating a cart or needing a key", async () => {
  const { service: s, calls } = await fixture(null);
  await s.refreshGuestCart();
  assert.equal(s.getGuestCartSnapshot().status, "ready");
  assert.deepEqual(s.getGuestCartSnapshot().items, []);
  assert.equal(calls.length, 0);
  assert.equal(s.guestCartCount(s.getGuestCartSnapshot()), 0);
});
test("restores saved credentials, items, backend catalogue names/prices and shared header count", async () => {
  const { service: s, calls } = await fixture();
  const counts = [];
  const unsubscribe = s.subscribeGuestCart(() =>
    counts.push(s.guestCartCount(s.getGuestCartSnapshot())),
  );
  await s.refreshGuestCart();
  const result = s.getGuestCartSnapshot();
  assert.equal(result.items[0].name, product.name);
  assert.equal(result.items[0].unitPrice, 250);
  assert.equal(result.items[0].quantity, 2);
  assert.equal(s.guestCartCount(result), 2);
  assert.deepEqual(calls[0], { action: "get_guest_cart", ...credentials });
  assert.ok(counts.includes(2));
  unsubscribe();
  const second = await fixture();
  await second.service.refreshGuestCart();
  assert.equal(second.service.guestCartCount(second.service.getGuestCartSnapshot()), 2);
});
test("quantity increase/decrease and removal use verified contracts and synchronize count", async () => {
  const { service: s, calls } = await fixture();
  await s.refreshGuestCart();
  await s.updateGuestCartQuantity(item.id, 3);
  assert.equal(s.guestCartCount(s.getGuestCartSnapshot()), 3);
  await s.updateGuestCartQuantity(item.id, 1);
  assert.equal(s.getGuestCartSnapshot().items[0].quantity, 1);
  assert.deepEqual(
    calls.find((x) => x.action === "update_quantity"),
    { action: "update_quantity", ...credentials, item_id: item.id, quantity: 3 },
  );
  await s.removeGuestCartItem(item.id);
  assert.deepEqual(s.getGuestCartSnapshot().items, []);
  assert.equal(s.guestCartCount(s.getGuestCartSnapshot()), 0);
  assert.deepEqual(
    calls.find((x) => x.action === "remove_item"),
    { action: "remove_item", ...credentials, item_id: item.id },
  );
});
test("selected configurations and prices come from the actual public variant record", async () => {
  const { service: s, state } = await fixture();
  state.items[0].variant_id = uuid(5);
  state.variant = {
    id: uuid(5),
    product_id: product.id,
    variant_name: "Large battery",
    currency: "USD",
    selling_price: 400,
    availability: "confirmed_available",
    is_active: true,
  };
  await s.refreshGuestCart();
  assert.equal(s.getGuestCartSnapshot().items[0].configuration, "Large battery");
  assert.equal(s.getGuestCartSnapshot().items[0].unitPrice, 400);
});
test("expired or invalid credentials clear access and suppress misleading counts", async () => {
  const { service: s, state, storage } = await fixture();
  await s.refreshGuestCart();
  state.fail = { status: 409, body: { error: "Cart is not active" } };
  await s.refreshGuestCart();
  assert.equal(storage.has(key), false);
  assert.equal(s.getGuestCartSnapshot().status, "error");
  assert.equal(s.guestCartCount(s.getGuestCartSnapshot()), 0);
});
test("network failure and rejected writes produce no success, optimistic quantity or automatic retry", async () => {
  const { service: s, state, calls } = await fixture();
  await s.refreshGuestCart();
  state.fail = new Error("network");
  await assert.rejects(s.updateGuestCartQuantity(item.id, 3), /may have completed/);
  assert.equal(calls.filter((c) => c.action === "update_quantity").length, 1);
  assert.equal(s.guestCartCount(s.getGuestCartSnapshot()), 0);
  state.fail = null;
  await s.refreshGuestCart();
  state.fail = { status: 400, body: { error: "Quantity rejected" } };
  await assert.rejects(s.updateGuestCartQuantity(item.id, 3));
  assert.equal(state.items[0].quantity, 2);
  assert.equal(s.getGuestCartSnapshot().status, "error");
});
test("repeated clicks cannot start duplicate mutations; count changes only after server response", async () => {
  const { service: s, state, calls } = await fixture();
  await s.refreshGuestCart();
  let release;
  state.hold = new Promise((r) => {
    release = r;
  });
  const pending = s.updateGuestCartQuantity(item.id, 3);
  await assert.rejects(s.updateGuestCartQuantity(item.id, 4), /already in progress/);
  assert.equal(s.getGuestCartSnapshot().busy, true);
  assert.equal(s.guestCartCount(s.getGuestCartSnapshot()), 2);
  state.hold = null;
  release();
  await pending;
  assert.equal(calls.filter((c) => c.action === "update_quantity").length, 1);
  assert.equal(s.guestCartCount(s.getGuestCartSnapshot()), 3);
});
test("wrong guest token never reads or mutates another guest cart", async () => {
  const other = { ...credentials, guest_token: uuid(99) };
  const { service: s, calls, state } = await fixture(other);
  await s.refreshGuestCart();
  assert.equal(s.getGuestCartSnapshot().status, "error");
  assert.deepEqual(s.getGuestCartSnapshot().items, []);
  assert.equal(s.guestCartCount(s.getGuestCartSnapshot()), 0);
  await assert.rejects(s.removeGuestCartItem(item.id));
  assert.equal(state.items.length, 1);
  assert.ok(calls.every((c) => c.guest_token === other.guest_token));
  assert.equal(calls.filter((c) => c.action === "remove_item").length, 0);
});
test("a response from an old session cannot populate a newly selected session", async () => {
  const { service: s, state, storage } = await fixture();
  let release;
  state.hold = new Promise((r) => (release = r));
  const pending = s.refreshGuestCart();
  storage.set(key, JSON.stringify({ cart_id: uuid(88), guest_token: uuid(89) }));
  state.hold = null;
  release();
  await pending;
  assert.equal(s.getGuestCartSnapshot().status, "error");
  assert.equal(s.guestCartCount(s.getGuestCartSnapshot()), 0);
});
test("product-page add uses UUID, then refreshes the same shared cart count", async () => {
  const { service: s, calls } = await fixture(null);
  await s.addProductToGuestCart(product);
  assert.equal(s.guestCartCount(s.getGuestCartSnapshot()), 3);
  assert.deepEqual(
    calls.find((c) => c.action === "add_item"),
    { action: "add_item", ...credentials, product_id: product.id, quantity: 1 },
  );
  await s.addProductToGuestCart(product);
  assert.equal(calls.filter((c) => c.action === "create_guest_cart").length, 1);
  assert.equal(s.guestCartCount(s.getGuestCartSnapshot()), 4);
});
test("draft demo product cannot be added and invalid quantities never call backend", async () => {
  const { service: s, calls } = await fixture();
  await assert.rejects(s.addProductToGuestCart({ ...product, slug: "solar-fridge-210l" }));
  await assert.rejects(s.updateGuestCartQuantity(item.id, 0));
  await assert.rejects(s.updateGuestCartQuantity(item.id, 101));
  assert.equal(calls.length, 0);
});

test("multiple items count actual server quantities without fabricated totals", async () => {
  const { service: s, state } = await fixture();
  state.items.push({ ...item, id: uuid(7), product_id: uuid(8), quantity: 4 });
  await s.refreshGuestCart();
  assert.equal(s.guestCartCount(s.getGuestCartSnapshot()), 6);
  assert.equal(s.getGuestCartSnapshot().items[1].name, undefined);
  assert.equal(s.getGuestCartSnapshot().items[1].unitPrice, undefined);
  assert.equal(s.getGuestCartSnapshot().items[1].available, false);
});

test("corrupted credentials are discarded without a backend request", async () => {
  const { service: s, storage, calls } = await fixture();
  storage.set(key, "not-json");
  await s.refreshGuestCart();
  assert.equal(s.getGuestCartSnapshot().status, "error");
  assert.equal(storage.has(key), false);
  assert.equal(calls.length, 0);
});

test("old unauthorized response cannot erase another guest's saved credentials", async () => {
  const { service: s, state, storage } = await fixture();
  let release;
  state.hold = new Promise((r) => {
    release = r;
  });
  state.fail = { status: 404, body: { error: "Cart not found or unauthorized" } };
  const pending = s.refreshGuestCart();
  const other = { cart_id: uuid(88), guest_token: uuid(89) };
  storage.set(key, JSON.stringify(other));
  state.hold = null;
  release();
  await pending;
  assert.deepEqual(JSON.parse(storage.get(key)), other);
  assert.equal(s.guestCartCount(s.getGuestCartSnapshot()), 0);
});

test("a successful write followed by a failed refresh never invites an automatic duplicate write", async () => {
  const { service: s, state, calls } = await fixture();
  await s.refreshGuestCart();
  state.rejectRefresh = true;
  await assert.rejects(
    s.updateGuestCartQuantity(item.id, 3),
    /server confirmed.*could not be loaded/,
  );
  assert.equal(state.items[0].quantity, 3);
  assert.equal(s.guestCartCount(s.getGuestCartSnapshot()), 0);
  assert.equal(calls.filter((c) => c.action === "update_quantity").length, 1);
});

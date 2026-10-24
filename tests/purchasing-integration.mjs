// Isolated PostgreSQL + real cart/checkout handlers. Never accepts a hosted URL.
import assert from "node:assert/strict";
import { purchasingDatabase, productId, variantId } from "./purchasing-database.mjs";
const f = await purchasingDatabase(process.argv[2]);
let checks = 0;
const check = (name, fn) => async () => {
  await fn();
  checks++;
  console.log(`PASS ${name}`);
};
const details = {
  email: "test@example.test",
  shipping_recipient_name: "Development Tester",
  shipping_line1: "Synthetic test address",
  shipping_city: "Test city",
  shipping_country_code: "ZA",
};
const key = "50000000-0000-4000-8000-000000000081";
try {
  const created = await (await f.cart({ action: "create_guest_cart", currency: "ZAR" })).json();
  const owner = { cart_id: created.cart.id, guest_token: created.guest_token };
  const add = {
    action: "add_item",
    ...owner,
    product_id: productId,
    variant_id: variantId,
    quantity: 1,
  };
  await check("guest B cannot read or modify guest A", async () => {
    for (const action of ["get_guest_cart", "add_item", "update_quantity", "remove_item"]) {
      const response = await f.cart({
        ...add,
        action,
        guest_token: crypto.randomUUID(),
        item_id: crypto.randomUUID(),
      });
      assert.equal(response.status, 404);
    }
  })();
  await check("configuration required; quantities bounded", async () => {
    assert.equal((await f.cart({ ...add, variant_id: null })).status, 400);
    for (const quantity of [0, 101, 1.5])
      assert.equal((await f.cart({ ...add, quantity })).status, 400);
  })();
  await check("invalid and inactive variants rejected", async () => {
    assert.equal((await f.cart({ ...add, variant_id: crypto.randomUUID() })).status, 400);
    await f.db.query("UPDATE product_variants SET is_active=false WHERE id=$1", [variantId]);
    assert.equal((await f.cart(add)).status, 409);
    await f.db.query("UPDATE product_variants SET is_active=true WHERE id=$1", [variantId]);
  })();
  await check("currency mismatch and unavailable parent rejected", async () => {
    await f.db.query("UPDATE product_variants SET currency='USD' WHERE id=$1", [variantId]);
    assert.equal((await f.cart(add)).status, 409);
    await f.db.query("UPDATE product_variants SET currency='ZAR' WHERE id=$1", [variantId]);
    await f.db.query("UPDATE products SET availability='out_of_stock' WHERE id=$1", [productId]);
    assert.equal((await f.cart(add)).status, 409);
    await f.db.query("UPDATE products SET availability='confirmed_available' WHERE id=$1", [
      productId,
    ]);
  })();
  const added = await (await f.cart(add)).json();
  assert(added.success);
  await check("quantity update and cart read preserve selected variant", async () => {
    assert.equal(
      (await f.cart({ ...owner, action: "update_quantity", item_id: added.item_id, quantity: 2 }))
        .status,
      200,
    );
    const state = await (await f.cart({ ...owner, action: "get_guest_cart" })).json();
    assert.equal(state.items[0].variant_id, variantId);
    assert.equal(state.items[0].quantity, 2);
  })();
  const preparation = { ...details, ...owner, idempotency_key: key };
  await check("browser price and total injection rejected", async () => {
    assert.equal((await f.checkout({ ...preparation, total_amount: "0.01" })).status, 400);
  })();
  await check("variant price and selected SKU frozen by actual SQL", async () => {
    const response = await f.checkout(preparation);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.payment_initiated, false);
    assert.equal(body.checkout.total_amount, "651.00");
    const row = (
      await f.db.query("SELECT * FROM checkout_items WHERE checkout_session_id=$1", [
        body.checkout.id,
      ])
    ).rows[0];
    assert.equal(row.variant_id, variantId);
    assert.equal(Number(row.unit_price), 325.5);
    assert.equal(Number(row.line_total), 651);
    assert.equal(row.product_sku, "DEV-EXTENDED");
  })();
  await check("repeated preparation does not duplicate checkout or snapshots", async () => {
    assert.equal((await f.checkout(preparation)).status, 200);
    assert.equal((await f.db.query("SELECT count(*)::int n FROM checkout_sessions")).rows[0].n, 1);
    assert.equal((await f.db.query("SELECT count(*)::int n FROM checkout_items")).rows[0].n, 1);
  })();
  await check("cross-cart idempotency reuse and wrong token rejected", async () => {
    assert.equal(
      (await f.checkout({ ...preparation, guest_token: crypto.randomUUID() })).status,
      404,
    );
    const other = await (await f.cart({ action: "create_guest_cart", currency: "ZAR" })).json();
    const otherOwner = { cart_id: other.cart.id, guest_token: other.guest_token };
    await f.cart({ ...add, ...otherOwner });
    assert.equal((await f.checkout({ ...preparation, ...otherOwner })).status, 409);
  })();
  await check("changed quantity cannot reuse stale checkout", async () => {
    await f.cart({ ...owner, action: "update_quantity", item_id: added.item_id, quantity: 3 });
    assert.equal((await f.checkout(preparation)).status, 409);
  })();
  await check(
    "idempotent replay preserves frozen price; fresh intent uses current price",
    async () => {
      await f.cart({ ...owner, action: "update_quantity", item_id: added.item_id, quantity: 2 });
      await f.db.query("UPDATE product_variants SET selling_price=400 WHERE id=$1", [variantId]);
      const replay = await (await f.checkout(preparation)).json();
      assert.equal(replay.checkout.total_amount, "651.00");
      const fresh = await (
        await f.checkout({ ...preparation, idempotency_key: crypto.randomUUID() })
      ).json();
      assert.equal(fresh.checkout.total_amount, "800.00");
      await f.db.query("UPDATE product_variants SET selling_price=325.50 WHERE id=$1", [variantId]);
    },
  )();
  await check("expired checkout cannot report success", async () => {
    await f.db.exec("UPDATE checkout_sessions SET expires_at=now()-interval '1 second'");
    assert.equal((await f.checkout(preparation)).status, 409);
  })();
  await check("removal and empty cart behaviour", async () => {
    assert.equal(
      (await f.cart({ ...owner, action: "remove_item", item_id: added.item_id })).status,
      200,
    );
    assert.equal(
      (await f.checkout({ ...preparation, idempotency_key: crypto.randomUUID() })).status,
      409,
    );
  })();
  await check("no payment or order created", async () => {
    for (const table of ["payments", "orders"])
      assert.equal((await f.db.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n, 0);
  })();
  console.log(
    `PASS ${checks} isolated integration families; no hosted operations; no concurrency claim.`,
  );
} finally {
  await f.db.close();
}

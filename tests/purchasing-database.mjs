/** Isolated SQL bridge for handler/browser tests. No hosted URL or credentials accepted. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { moduleUrl } from "./purchasing-modules.mjs";
const quote = (value) => {
  if (!/^[a-z_][a-z_0-9]*$/.test(value)) throw new Error("Unsafe test identifier");
  return `"${value}"`;
};
export const productId = "10000000-0000-4000-8000-000000000081";
export const variantId = "20000000-0000-4000-8000-000000000081";
export async function purchasingDatabase(runtime) {
  if (!runtime?.startsWith("/") || !runtime.endsWith("/@electric-sql/pglite/dist/index.js"))
    throw new Error("Isolated PGlite path required");
  const { PGlite } = await import(pathToFileURL(runtime).href);
  const db = new PGlite({ database: "postgres" });
  await db.exec("SET oddgrid.isolated_test='yes';");
  await db.exec(readFileSync("backend/checkout-prepare/tests/export-fixture.sql", "utf8"));
  await db.exec(
    readFileSync(
      "backend/checkout-prepare/migrations/20261021_001_secure_variant_checkout.sql",
      "utf8",
    ),
  );
  await db.exec(`GRANT USAGE ON SCHEMA public TO anon,authenticated;
    GRANT SELECT ON public.products,public.product_variants TO anon,authenticated;
    ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Public can read active products" ON public.products FOR SELECT TO anon,authenticated USING(status='active' AND availability<>'discontinued');
    ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;`);
  await db.exec(
    readFileSync("backend/checkout-prepare/production/variant-read-policy-review.sql", "utf8"),
  );
  await db.exec(
    readFileSync("backend/checkout-prepare/development/purchasing/fixtures.sql", "utf8"),
  );
  function from(table) {
    if (
      !["carts", "cart_items", "products", "product_variants", "checkout_sessions"].includes(table)
    )
      throw new Error("Unexpected test table");
    let action = "select",
      columns = "*",
      payload = {},
      filters = [];
    const query = {
      select(value) {
        columns = value;
        return this;
      },
      insert(value) {
        action = "insert";
        payload = value;
        return this;
      },
      update(value) {
        action = "update";
        payload = value;
        return this;
      },
      delete() {
        action = "delete";
        return this;
      },
      eq(column, value) {
        filters.push([column, value]);
        return this;
      },
      is(column, value) {
        assert.equal(value, null);
        filters.push([column, null]);
        return this;
      },
      single() {
        return execute(true);
      },
      maybeSingle() {
        return execute(true);
      },
      then(resolve, reject) {
        return execute(false).then(resolve, reject);
      },
    };
    async function execute(single) {
      const params = [];
      const bind = (value) => {
        params.push(value);
        return `$${params.length}`;
      };
      const fields =
        columns === "*"
          ? "*"
          : columns
              .split(",")
              .map((x) => quote(x.trim()))
              .join(",");
      let sql;
      if (action === "insert")
        sql = `INSERT INTO public.${quote(table)} (${Object.keys(payload).map(quote)}) VALUES (${Object.values(payload).map(bind)})`;
      if (action === "update")
        sql = `UPDATE public.${quote(table)} SET ${Object.entries(payload)
          .map(([key, value]) => `${quote(key)}=${bind(value)}`)
          .join(",")}`;
      if (action === "delete") sql = `DELETE FROM public.${quote(table)}`;
      if (action === "select") sql = `SELECT ${fields} FROM public.${quote(table)}`;
      if (filters.length)
        sql += ` WHERE ${filters.map(([column, value]) => (value === null ? `${quote(column)} IS NULL` : `${quote(column)}=${bind(value)}`)).join(" AND ")}`;
      if (action !== "select") sql += ` RETURNING ${fields}`;
      try {
        const result = await db.query(sql, params);
        return { data: single ? (result.rows[0] ?? null) : result.rows, error: null };
      } catch (error) {
        return { data: null, error: { message: "Isolated operation rejected", code: error.code } };
      }
    }
    return query;
  }
  const client = { from };
  async function rest(input, options = {}) {
    const url = new URL(input);
    assert.equal(url.hostname, "isolated.test");
    const table = url.pathname.split("/").at(-1);
    if (url.pathname.includes("/rpc/")) {
      assert.equal(table, "checkout_prepare_bridge", "No payment or finalization RPC allowed");
      const body = JSON.parse(options.body),
        params = Object.values(body);
      try {
        const result = await db.query(
          `SELECT public.checkout_prepare_bridge(${Object.keys(body)
            .map((key, i) => `${quote(key)} => $${i + 1}`)
            .join(",")}) AS id`,
          params,
        );
        return Response.json(result.rows[0].id);
      } catch (error) {
        return Response.json({ code: error.code }, { status: 409 });
      }
    }
    const query = from(table).select(url.searchParams.get("select") ?? "*");
    for (const [key, value] of url.searchParams) {
      if (["select", "order", "limit"].includes(key)) continue;
      if (value.startsWith("eq.")) query.eq(key, value.slice(3));
      else if (value === "is.null") query.is(key, null);
      else if (value.startsWith("in.(")) {
        // Adapter's product list contains one parent in this journey.
        const ids = value.slice(4, -1).split(",");
        assert.equal(ids.length, 1);
        query.eq(key, ids[0]);
      } else throw new Error("Unexpected test filter");
    }
    const result = await query;
    return result.error
      ? Response.json({ code: result.error.code }, { status: 500 })
      : Response.json(result.data);
  }
  const { handleGuestCart } = await import(moduleUrl("backend/cart/handler.ts"));
  const { handleCheckoutPrepare } = await import(moduleUrl("backend/checkout-prepare/handler.ts"));
  const { createSupabaseCheckoutBackend } = await import(
    moduleUrl("backend/checkout-prepare/adapter.ts")
  );
  const backend = createSupabaseCheckoutBackend({
    url: "https://isolated.test",
    serviceRoleKey: "isolated-server-only",
    request: rest,
  });
  const origin = "http://localhost:5173";
  const request = (body) =>
    new Request(origin, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify(body),
    });
  return {
    db,
    client,
    request,
    cart: (body) => handleGuestCart(request(body), { client, allowedOrigins: [origin] }),
    checkout: (body) =>
      handleCheckoutPrepare(request(body), {
        enabled: true,
        contractsReviewed: true,
        backend,
        allowedOrigins: [origin],
      }),
  };
}

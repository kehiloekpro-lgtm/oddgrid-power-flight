import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const dataUrl = (text) => `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`;
const compile = (text) =>
  ts.transpileModule(text, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
const config = dataUrl(
  'export const SUPABASE_PUBLISHABLE_KEY="public-test"; export const SUPABASE_URL="https://example.test";',
);
const api = dataUrl(
  compile(
    readFileSync("src/lib/supabase-products.ts", "utf8").replace(
      '"./supabase-config"',
      JSON.stringify(config),
    ),
  ),
);
const featured = await import(
  dataUrl(
    compile(
      readFileSync("src/lib/featured-products.ts", "utf8").replace(
        '"./supabase-products"',
        JSON.stringify(api),
      ),
    ),
  )
);
const categories = [
  { id: "cold", slug: "sub-zero", name: "Refrigeration", parent_id: null, is_active: true },
  { id: "child", slug: "fridges", name: "Fridges", parent_id: "cold", is_active: true },
  {
    id: "grandchild",
    slug: "solar-fridges",
    name: "Solar fridges",
    parent_id: "child",
    is_active: true,
  },
  { id: "power", slug: "back-up-power", name: "Power", parent_id: null, is_active: true },
];
const product = (id, category_id, extra = {}) => ({
  id,
  slug: `product-${id}`,
  name: `Product ${id}`,
  category_id,
  status: "active",
  availability: "confirmed_available",
  sale_type: "direct",
  selling_price: 123,
  currency: "USD",
  ...extra,
});
let rows = [],
  fail = false,
  photos = [];
globalThis.fetch = async (url) => {
  const table = new URL(url).pathname.split("/").pop();
  if (fail) throw new Error("offline");
  return new Response(
    JSON.stringify(
      table === "products"
        ? rows
        : table === "categories"
          ? categories
          : table === "product_images"
            ? photos
            : [],
    ),
  );
};
test("empty catalogue remains empty", async () => {
  assert.deepEqual(await featured.loadFeaturedProducts(), { cooling: [], power: [] });
});
test("refrigeration, power and nested children; limit four; exclude drafts", async () => {
  rows = [
    product("1", "grandchild"),
    product("2", "power"),
    product("draft", "cold", { status: "draft" }),
    ...Array.from({ length: 6 }, (_, i) => product(`cold${i}`, "cold")),
  ];
  const result = await featured.loadFeaturedProducts();
  assert.equal(result.cooling.length, 4);
  assert.equal(result.cooling[0].product.id, "1");
  assert.equal(result.cooling[0].categoryName, "Solar fridges");
  assert.deepEqual(
    result.power.map((item) => item.product.id),
    ["2"],
  );
});
test("actual currency/price, RFQ and unusable prices", async () => {
  rows = [
    product("1", "cold", { currency: "ZAR" }),
    product("2", "cold", { sale_type: "rfq" }),
    product("3", "cold", { selling_price: null }),
  ];
  const { cooling } = await featured.loadFeaturedProducts();
  assert.match(cooling[0].price, /123/);
  assert.match(cooling[0].price, /R/);
  assert.equal(cooling[1].price, "Price on request");
  assert.equal(cooling[2].price, "Price on request");
});
test("missing/unsafe photograph remains neutral; approved image resolved", async () => {
  rows = [product("1", "cold")];
  photos = [{ external_url: "http://unsafe.test/image", storage_path: null }];
  assert.equal((await featured.loadFeaturedProducts()).cooling[0].image, null);
  photos = [
    {
      external_url: "https://example.test/photo.jpg",
      alt_text: "Approved photo",
      is_primary: true,
      display_order: 0,
    },
  ];
  const { cooling } = await featured.loadFeaturedProducts();
  assert.equal(cooling[0].image, "https://example.test/photo.jpg");
  assert.equal(cooling[0].imageAlt, "Approved photo");
});
test("catalogue network failure rejects rather than becoming empty", async () => {
  fail = true;
  await assert.rejects(featured.loadFeaturedProducts(), /offline/);
  fail = false;
});
test("cards link by Supabase slug and never render purchase or local-demo actions", () => {
  const card = readFileSync("src/components/site/SupabaseProductCard.tsx", "utf8");
  assert.match(card, /to="\/products\/\$productId"\s+params=\{\{ productId: product.slug \}\}/);
  assert.doesNotMatch(card, /useQuote|addToCart|products.json|imageMap/);
  const home = readFileSync("src/routes/index.tsx", "utf8");
  assert.doesNotMatch(home, /byCategory|<ProductCard/);
  assert.match(home, /loadState === "error"/);
  assert.match(home, /loadState === "ready" && products.length === 0/);
});

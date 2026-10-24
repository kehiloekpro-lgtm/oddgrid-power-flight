/** Local browser journey against isolated SQL and real staged handlers. No hosted writes.
 * Start Vite with the documented Development env; pass installed runtime module paths.
 */
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { purchasingDatabase } from "./purchasing-database.mjs";
const [runtime, playwrightPath] = process.argv.slice(2);
if (!playwrightPath?.startsWith("/") || !playwrightPath.endsWith("/playwright/index.mjs"))
  throw new Error("Installed Playwright module path required");
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const f = await purchasingDatabase(runtime);
const launchOptions = {
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--no-zygote",
    "--single-process",
    "--disable-gpu",
  ],
  ...(process.env.ODDGRID_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.ODDGRID_CHROMIUM_EXECUTABLE }
    : {}),
};
let browser;
try {
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    browser = await chromium.launch(launchOptions);
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors = [];
    let checkoutUnavailable = true;
    page.on("pageerror", (error) => errors.push(error.message));
    await context.route("https://*.supabase.co/**", async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      assert.equal(url.hostname, "ogbnpvroaafgpnlxeftw.supabase.co", "Production access forbidden");
      let response;
      if (url.pathname.startsWith("/functions/v1/")) {
        const body = request.postDataJSON();
        const action = url.pathname.split("/").at(-1);
        response =
          action === "cart-api"
            ? await f.cart(body)
            : checkoutUnavailable
              ? Response.json({ error: "Checkout is not available yet" }, { status: 503 })
              : await f.checkout(body);
      } else if (url.pathname.startsWith("/rest/v1/")) {
        const table = url.pathname.split("/").at(-1);
        if (["products", "product_variants"].includes(table)) {
          // Real SELECT uses the reviewed isolated RLS policy, never service-role reads.
          const rows = await f.db.transaction(async (tx) => {
            await tx.exec("SET LOCAL ROLE anon");
            let sql = `SELECT * FROM public.${table}`;
            const params = [];
            const filters = [];
            for (const key of ["id", "product_id", "slug"]) {
              const filter = url.searchParams.get(key);
              if (!filter) continue;
              if (filter.startsWith("eq.")) {
                params.push(filter.slice(3));
                filters.push(`${key}=$${params.length}`);
              } else if (filter.startsWith("in.(")) {
                const values = filter.slice(4, -1).split(",");
                const binds = values.map((value) => {
                  params.push(value);
                  return `$${params.length}`;
                });
                filters.push(`${key} IN (${binds.join(",")})`);
              } else throw Error("Unexpected browser catalogue filter");
            }
            if (filters.length) sql += " WHERE " + filters.join(" AND ");
            return (await tx.query(sql, params)).rows;
          });
          response = Response.json(
            rows.map((row) => ({
              ...row,
              selling_price: row.selling_price === null ? null : Number(row.selling_price),
            })),
          );
        } else response = Response.json([]);
      } else throw new Error("Unexpected browser request");
      await route.fulfill({
        status: response.status,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": request.headers()["origin"] ?? "http://localhost:5173",
        },
        body: await response.text(),
      });
    });
    // Response is native Web Response, not Playwright APIResponse.
    await page.goto("http://localhost:5173/products/development-test-power-station");
    await page
      .getByRole("heading", { name: "DEVELOPMENT TEST — Power station", exact: true })
      .waitFor();
    await page
      .getByRole("combobox")
      .selectOption({ index: 1 }, { timeout: 10000 })
      .catch(async (error) => {
        console.log(await page.locator("body").innerText());
        throw error;
      });
    await page.getByRole("button", { name: "Add to Cart", exact: true }).click();
    await page.getByText("added to your cart.", { exact: false }).waitFor();
    await page.getByRole("link", { name: "View cart", exact: true }).click();
    await page.getByRole("button", { name: "Increase quantity", exact: false }).click();
    await page.getByLabel("Quantity", { exact: true }).filter({ hasText: "2" }).waitFor();
    await page.reload();
    await page.getByLabel("Quantity", { exact: true }).filter({ hasText: "2" }).waitFor();
    await page.getByRole("link", { name: "Review checkout preparation" }).click();
    await page.getByLabel("Email", { exact: true }).fill("browser@example.test");
    await page.getByLabel("Recipient name", { exact: true }).fill("Development Tester");
    await page.getByLabel("Address line 1", { exact: true }).fill("Synthetic test address");
    await page.getByLabel("City", { exact: true }).fill("Test city");
    await page.getByLabel("Country code", { exact: false }).fill("ZA");
    await page.getByRole("button", { name: "Prepare checkout (no payment)" }).click();
    await page.getByRole("alert").filter({ hasText: "Checkout is not available yet" }).waitFor();
    checkoutUnavailable = false;
    await page.getByRole("button", { name: "Prepare checkout (no payment)" }).click();
    await page.getByRole("heading", { name: "Checkout session prepared" }).waitFor();
    assert.match(await page.locator("body").innerText(), /ZAR 651.00/);
    assert.match(await page.locator("body").innerText(), /not an order/);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
      "No horizontal overflow",
    );
    await page.keyboard.press("Tab");
    assert.notEqual(await page.evaluate(() => document.activeElement?.tagName), "BODY");
    await page.goto("http://localhost:5173/cart");
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await page.getByRole("heading", { name: "Your cart is empty" }).waitFor();
    assert.deepEqual(errors, []);
    console.log(
      `PASS browser ${viewport.width}px: variant, add, quantity, reload, form, SQL checkout total, removal, empty, keyboard, overflow`,
    );
    await context.close();
    await browser.close();
  }
  assert.equal((await f.db.query("SELECT count(*)::int n FROM payments")).rows[0].n, 0);
  assert.equal((await f.db.query("SELECT count(*)::int n FROM orders")).rows[0].n, 0);
} finally {
  await browser?.close();
  await f.db.close();
}

import { snapshotCart } from "../checkout-prepare/pricing.ts";

// Adapted from the existing deployed cart-api v1 on 2026-10-24.
// Same actions and database tables; Development wrapper supplies server-only client.
export interface CartRow {
  name: string;
  sku: string | null;
  variant_name: string;
  id: string;
  quantity: number;
  currency: string;
  status: string;
  guest_token: string;
  product_id: string;
  variant_id: string | null;
  selling_price: number | null;
  sale_type: string;
  availability: string;
  is_active: boolean;
}
interface Result<T> {
  data: T | null;
  error: { message?: string } | null;
}
interface Query extends PromiseLike<Result<CartRow[]>> {
  select(columns: string): Query;
  insert(value: Record<string, unknown>): Query;
  update(value: Record<string, unknown>): Query;
  delete(): Query;
  eq(column: string, value: unknown): Query;
  is(column: string, value: null): Query;
  single(): Promise<Result<CartRow>>;
  maybeSingle(): Promise<Result<CartRow>>;
}
export interface CartClient {
  from(table: string): Query;
}
function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

function validQuantity(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 100;
}

function toCents(value: unknown): bigint | null {
  if (value === null || value === undefined) {
    return null;
  }

  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));

  if (!match) {
    return null;
  }

  return BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
}

export async function handleGuestCart(
  req: Request,
  options: { client: CartClient; allowedOrigins: string[] },
): Promise<Response> {
  const origin = req.headers.get("Origin");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  };
  if (origin && options.allowedOrigins.includes(origin))
    headers["Access-Control-Allow-Origin"] = origin;
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers });
  if (origin && !options.allowedOrigins.includes(origin))
    return json({ error: "Origin not allowed" }, 403);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    return json({ error: "JSON request required" }, 415);
  const supabase = options.client;
  // ---------------------------------------------------
  // REQUEST BODY PARSING
  // ---------------------------------------------------

  let body: Record<string, unknown>;

  try {
    const reader = req.body?.getReader();
    if (!reader) return json({ error: "Invalid request body" }, 400);
    let bytes = new Uint8Array();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (bytes.length + value.length > 8192) {
        await reader.cancel();
        return json({ error: "Request too large" }, 413);
      }
      const joined = new Uint8Array(bytes.length + value.length);
      joined.set(bytes);
      joined.set(value, bytes.length);
      bytes = joined;
    }
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json({ error: "Invalid request body" }, 400);
    }

    body = parsed as Record<string, unknown>;
  } catch {
    return json(
      {
        error: "Invalid JSON body",
      },
      400,
    );
  }

  // ---------------------------------------------------
  // CART OPERATIONS
  // ---------------------------------------------------

  try {
    const action = body.action;
    if (
      ![
        "create_guest_cart",
        "get_guest_cart",
        "add_item",
        "update_quantity",
        "remove_item",
      ].includes(String(action))
    )
      return json({ error: "Unknown action" }, 400);

    // =================================================
    // ACTION 1 — CREATE GUEST CART
    // =================================================

    if (action === "create_guest_cart") {
      if (body.currency !== "ZAR" && body.currency !== "USD") {
        return json({ error: "Unsupported currency" }, 400);
      }

      const guestToken = crypto.randomUUID();

      const { data: cart, error } = await supabase
        .from("carts")
        .insert({
          guest_token: guestToken,
          currency: body.currency,
          status: "active",
        })
        .select("id, currency, status")
        .single();

      if (error || !cart) {
        return json({ error: "Could not create cart" }, 500);
      }

      return json(
        {
          cart,
          guest_token: guestToken,
        },
        201,
      );
    }

    // =================================================
    // VERIFY GUEST CART OWNERSHIP
    // =================================================

    if (!isUuid(body.cart_id) || !isUuid(body.guest_token)) {
      return json({ error: "Valid cart credentials required" }, 400);
    }

    const { data: cart, error: cartError } = await supabase
      .from("carts")
      .select("id, currency, status")
      .eq("id", body.cart_id)
      .eq("guest_token", body.guest_token)
      .is("user_id", null)
      .maybeSingle();

    if (cartError) {
      return json({ error: "Cart lookup failed" }, 500);
    }

    if (!cart) {
      return json({ error: "Cart not found or unauthorized" }, 404);
    }

    if (cart.status !== "active") {
      return json({ error: "Cart is not active" }, 409);
    }

    // =================================================
    // ACTION 2 — GET GUEST CART
    // =================================================

    if (action === "get_guest_cart") {
      const { data: items, error } = await supabase
        .from("cart_items")
        .select("id, product_id, variant_id, quantity")
        .eq("cart_id", cart.id);

      if (error) {
        return json({ error: "Could not retrieve cart items" }, 500);
      }

      return json({
        cart,
        items: items ?? [],
      });
    }

    // =================================================
    // ACTION 3 — ADD ITEM
    // =================================================

    if (action === "add_item") {
      if (!isUuid(body.product_id)) {
        return json({ error: "Valid product_id required" }, 400);
      }

      if (!validQuantity(body.quantity)) {
        return json(
          {
            error: "Quantity must be between 1 and 100",
          },
          400,
        );
      }

      if (body.variant_id !== null && body.variant_id !== undefined && !isUuid(body.variant_id)) {
        return json({ error: "Invalid variant_id" }, 400);
      }

      const variantId = body.variant_id ?? null;

      // -----------------------------------------------
      // PRODUCT LOOKUP
      // -----------------------------------------------

      const { data: product, error: productError } = await supabase
        .from("products")
        .select("id, currency, selling_price, sale_type, status, availability")
        .eq("id", body.product_id)
        .maybeSingle();

      if (productError) {
        return json({ error: "Product lookup failed" }, 500);
      }

      if (!product) {
        return json({ error: "Product not found" }, 404);
      }

      if (
        product.status !== "active" ||
        product.sale_type !== "direct" ||
        product.availability !== "confirmed_available"
      ) {
        return json(
          {
            error: "Product is not available for direct purchase",
          },
          409,
        );
      }

      let currency = String(product.currency).trim();

      let price = product.selling_price;

      let availability = product.availability;

      // -----------------------------------------------
      // VARIANT LOOKUP
      // -----------------------------------------------

      const { data: variants, error: variantsError } = await supabase
        .from("product_variants")
        .select("id, product_id, currency, selling_price, availability, is_active")
        .eq("product_id", product.id);

      if (variantsError) {
        return json({ error: "Variant lookup failed" }, 500);
      }

      if (variantId) {
        const variant = (variants ?? []).find((v) => v.id === variantId);

        if (!variant) {
          return json(
            {
              error: "Variant does not belong to product",
            },
            400,
          );
        }

        if (!variant.is_active) {
          return json(
            {
              error: "Selected variant is inactive",
            },
            409,
          );
        }

        currency = String(variant.currency).trim();

        price = variant.selling_price;

        availability = variant.availability;
      } else if (variants?.length) {
        return json(
          {
            error: "Product configuration must be selected",
          },
          400,
        );
      }

      // -----------------------------------------------
      // PRODUCT ELIGIBILITY
      // -----------------------------------------------

      if (availability !== "confirmed_available") {
        return json(
          {
            error: "Supplier availability is not confirmed",
          },
          409,
        );
      }

      if (
        currency !== String(product.currency).trim() ||
        currency !== String(cart.currency).trim()
      ) {
        return json({ error: "Currency mismatch" }, 409);
      }

      const priceCents = toCents(price);

      if (priceCents === null || priceCents <= 0n) {
        return json(
          {
            error: "Invalid or missing selling price",
          },
          409,
        );
      }

      // -----------------------------------------------
      // CHECK EXISTING CART ITEM
      // -----------------------------------------------

      let existingQuery = supabase
        .from("cart_items")
        .select("id, quantity")
        .eq("cart_id", cart.id)
        .eq("product_id", product.id);

      existingQuery = variantId
        ? existingQuery.eq("variant_id", variantId)
        : existingQuery.is("variant_id", null);

      const { data: existing, error: existingError } = await existingQuery.maybeSingle();

      if (existingError) {
        return json(
          {
            error: "Cart item lookup failed",
          },
          500,
        );
      }

      // -----------------------------------------------
      // INCREASE EXISTING QUANTITY
      // -----------------------------------------------

      if (existing) {
        const newQuantity = existing.quantity + body.quantity;

        if (!validQuantity(newQuantity)) {
          return json(
            {
              error: "Combined quantity exceeds 100",
            },
            400,
          );
        }

        const { data: changed, error } = await supabase
          .from("cart_items")
          .update({
            quantity: newQuantity,
          })
          .eq("id", existing.id)
          .eq("cart_id", cart.id)
          .eq("quantity", existing.quantity)
          .select("id, quantity")
          .maybeSingle();

        if (error || !changed) {
          return json(
            {
              error: "Could not update cart item",
            },
            500,
          );
        }

        return json({
          success: true,
          action: "add_item",
          item_id: existing.id,
          quantity: newQuantity,
        });
      }

      // -----------------------------------------------
      // INSERT NEW CART ITEM
      // -----------------------------------------------

      const { data: inserted, error: insertError } = await supabase
        .from("cart_items")
        .insert({
          cart_id: cart.id,
          product_id: product.id,
          variant_id: variantId,
          quantity: body.quantity,
        })
        .select("id, quantity")
        .single();

      if (insertError || !inserted) {
        return json(
          {
            error: "Could not add item",
          },
          500,
        );
      }

      return json(
        {
          success: true,
          action: "add_item",
          item_id: inserted.id,
          quantity: inserted.quantity,
        },
        201,
      );
    }

    // =================================================
    // ACTION 4 — UPDATE QUANTITY
    // =================================================

    if (action === "update_quantity") {
      if (!isUuid(body.item_id) || !validQuantity(body.quantity)) {
        return json(
          {
            error: "Valid item_id and quantity required (1–100)",
          },
          400,
        );
      }

      const { data: selected, error: selectedError } = await supabase
        .from("cart_items")
        .select("id,product_id,variant_id,quantity")
        .eq("id", body.item_id)
        .eq("cart_id", cart.id)
        .maybeSingle();
      if (selectedError) return json({ error: "Cart item lookup failed" }, 500);
      if (!selected) return json({ error: "Cart item not found" }, 404);
      const { data: product, error: productError } = await supabase
        .from("products")
        .select("id,name,sku,currency,selling_price,status,sale_type,availability")
        .eq("id", selected.product_id)
        .maybeSingle();
      const { data: variants, error: variantError } = await supabase
        .from("product_variants")
        .select("id,product_id,variant_name,sku,currency,selling_price,availability,is_active")
        .eq("product_id", selected.product_id);
      if (productError || variantError) return json({ error: "Product lookup failed" }, 500);
      try {
        snapshotCart(
          [
            {
              product_id: selected.product_id,
              variant_id: selected.variant_id,
              quantity: body.quantity,
            },
          ],
          product ? [product] : [],
          variants ?? [],
          cart.currency,
        );
      } catch {
        return json({ error: "Cart item is no longer available" }, 409);
      }

      const { data: updated, error } = await supabase
        .from("cart_items")
        .update({
          quantity: body.quantity,
        })
        .eq("id", body.item_id)
        .eq("cart_id", cart.id)
        .select("id, quantity")
        .maybeSingle();

      if (error) {
        return json(
          {
            error: "Could not update quantity",
          },
          500,
        );
      }

      if (!updated) {
        return json({ error: "Cart item not found" }, 404);
      }

      return json({
        success: true,
        action: "update_quantity",
        item_id: updated.id,
        quantity: updated.quantity,
      });
    }

    // =================================================
    // ACTION 5 — REMOVE ITEM
    // =================================================

    if (action === "remove_item") {
      if (!isUuid(body.item_id)) {
        return json({ error: "Valid item_id required" }, 400);
      }

      const { data: removed, error } = await supabase
        .from("cart_items")
        .delete()
        .eq("id", body.item_id)
        .eq("cart_id", cart.id)
        .select("id")
        .maybeSingle();

      if (error) {
        return json(
          {
            error: "Could not remove item",
          },
          500,
        );
      }

      if (!removed) {
        return json({ error: "Cart item not found" }, 404);
      }

      return json({
        success: true,
        action: "remove_item",
        item_id: removed.id,
      });
    }

    // =================================================
    // UNKNOWN ACTION
    // =================================================

    return json({ error: "Unknown action" }, 400);
  } catch {
    return json({ error: "Internal server error" }, 500);
  }
}

import {
  checkoutUuid,
  readPreparedCheckout,
  type CheckoutRequest,
} from "../../src/lib/checkout-contract.ts";
import { CheckoutRejection, type CheckoutBackend } from "./handler.ts";
import type { ProductRecord, VariantRecord, CheckoutCartItem } from "./pricing.ts";

interface AdapterOptions {
  url: string;
  serviceRoleKey: string;
  request?: typeof fetch;
}
/** EDGE ONLY: never import this module from src/. No caller-supplied URL, key or auth header. */
export function createSupabaseCheckoutBackend(options: AdapterOptions): CheckoutBackend {
  const url = new URL(options.url);
  if (
    !options.serviceRoleKey ||
    (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname))
  )
    throw new Error("Invalid server configuration");
  const request = options.request ?? fetch;
  const headers = {
    apikey: options.serviceRoleKey,
    Authorization: `Bearer ${options.serviceRoleKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  async function rest(
    path: string,
    query: Record<string, string>,
    body?: Record<string, unknown>,
  ): Promise<unknown> {
    const endpoint = new URL(`/rest/v1/${path}`, url);
    for (const [key, value] of Object.entries(query)) endpoint.searchParams.set(key, value);
    const response = await request(endpoint.toString(), {
      method: body ? "POST" : "GET",
      cache: "no-store",
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20000),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      // Use only known SQLSTATE classifications. Never return DB messages or raw bodies.
      const code = result && typeof result === "object" && "code" in result ? result.code : null;
      if (code === "42501") throw new CheckoutRejection(404);
      if (code === "22023") throw new CheckoutRejection(409);
      throw new Error("Checkout service request failed");
    }
    return result;
  }
  async function rows<T>(table: string, query: Record<string, string>): Promise<T[]> {
    const result = await rest(table, query);
    if (!Array.isArray(result)) throw new Error("Unexpected service response");
    return result as T[];
  }
  async function guest(cartId: string, guestToken: string) {
    if (!checkoutUuid(cartId) || !checkoutUuid(guestToken)) return null;
    const found = await rows<{ id: string; currency: string; status: string }>("carts", {
      select: "id,currency,status",
      id: `eq.${cartId}`,
      guest_token: `eq.${guestToken}`,
      user_id: "is.null",
      limit: "1",
    });
    return found[0]?.id === cartId ? found[0] : null;
  }
  return {
    async authorizeGuestCart(cartId, guestToken) {
      const cart = await guest(cartId, guestToken);
      if (!cart) return null;
      if (cart.status !== "active") return { ...cart, items: [], products: [], variants: [] };
      const items = await rows<CheckoutCartItem>("cart_items", {
        select: "product_id,variant_id,quantity",
        cart_id: `eq.${cartId}`,
      });
      if (!items.length) return { ...cart, items, products: [], variants: [] };
      if (
        items.some(
          (item) =>
            !checkoutUuid(item.product_id) ||
            (item.variant_id !== null && !checkoutUuid(item.variant_id)),
        )
      )
        throw new Error("Invalid saved cart");
      const ids = [...new Set(items.map((item) => item.product_id))].join(",");
      const [products, variants] = await Promise.all([
        rows<ProductRecord>("products", {
          select: "id,name,sku,currency,selling_price,status,sale_type,availability",
          id: `in.(${ids})`,
        }),
        rows<VariantRecord>("product_variants", {
          select: "id,product_id,variant_name,sku,currency,selling_price,availability,is_active",
          product_id: `in.(${ids})`,
        }),
      ]);
      return { ...cart, items, products, variants };
    },
    async prepare(input: CheckoutRequest) {
      // This explicit allowlist excludes all browser-supplied amounts or item records.
      const body = {
        p_cart_id: input.cart_id,
        p_guest_token: input.guest_token,
        p_idempotency_key: input.idempotency_key,
        p_email: input.email,
        p_phone: input.phone || null,
        p_shipping_recipient_name: input.shipping_recipient_name,
        p_shipping_phone: input.shipping_phone || null,
        p_shipping_line1: input.shipping_line1,
        p_shipping_line2: input.shipping_line2 || null,
        p_shipping_city: input.shipping_city,
        p_shipping_region: input.shipping_region || null,
        p_shipping_postal_code: input.shipping_postal_code || null,
        p_shipping_country_code: input.shipping_country_code,
      };
      // New 13-argument signature checks guest ownership INSIDE the locked SQL transaction.
      const id = await rest("rpc/checkout_prepare_bridge", {}, body);
      if (!checkoutUuid(id)) throw new Error("Checkout was not confirmed");
      // Recheck credentials before readback; a revoked/changed token cannot expose the row.
      const cart = await guest(input.cart_id, input.guest_token);
      if (!cart) throw new CheckoutRejection(404);
      if (cart.status !== "active") throw new CheckoutRejection(409);
      const result = await rows<Record<string, unknown>>("checkout_sessions", {
        select:
          "id,cart_id,status,currency,expires_at,subtotal,shipping_amount,tax_amount,discount_amount,total_amount",
        id: `eq.${id}`,
        cart_id: `eq.${input.cart_id}`,
        idempotency_key: `eq.${input.idempotency_key}`,
        limit: "1",
      });
      const session = result[0];
      if (
        !session ||
        session.id !== id ||
        session.cart_id !== input.cart_id ||
        !["open", "payment_pending"].includes(String(session.status))
      )
        throw new CheckoutRejection(409);
      const normalized = { ...session };
      for (const key of [
        "subtotal",
        "shipping_amount",
        "tax_amount",
        "discount_amount",
        "total_amount",
      ]) {
        const value = session[key];
        if (typeof value !== "string" && typeof value !== "number")
          throw new Error("Invalid authoritative amount");
        const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(String(value));
        if (!match) throw new Error("Invalid authoritative amount");
        normalized[key] = `${match[1]}.${(match[2] ?? "").padEnd(2, "0")}`;
      }
      return readPreparedCheckout(normalized, input.cart_id, cart.currency);
    },
  };
}

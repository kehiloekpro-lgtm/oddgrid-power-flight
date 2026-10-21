import {
  readCheckoutRequest,
  readPreparedCheckout,
  type CheckoutRequest,
  type PreparedCheckout,
} from "../../src/lib/checkout-contract.ts";
import {
  snapshotCart,
  type CheckoutCartItem,
  type ProductRecord,
  type VariantRecord,
} from "./pricing.ts";

/** Server-only adapter to the migrated checkout bridge. Deployment approval remains closed. */
export interface CheckoutBackend {
  /** Query guest carts with BOTH UUIDs; no invented cart expiry. DB repeats authorization
   * under the cart lock, and rejects old signatures without guest proof.
   */
  authorizeGuestCart(
    cartId: string,
    guestToken: string,
  ): Promise<{
    id: string;
    currency: string;
    status: string;
    items: CheckoutCartItem[];
    products: ProductRecord[];
    variants: VariantRecord[];
  } | null>;
  /** MUST atomically reauthorize, lock/revalidate/reprice and snapshot through the reviewed
   * existing checkout bridge. Preserve its UUID idempotency key and reject cross-cart reuse.
   * Never create a payment attempt or order. Preflight snapshotCart alone is insufficient.
   */
  prepare(request: CheckoutRequest): Promise<PreparedCheckout>;
}
export class CheckoutRejection extends Error {
  constructor(readonly status: 404 | 409) {
    super("Checkout preparation rejected");
  }
}
export interface CheckoutOptions {
  enabled: boolean;
  contractsReviewed: boolean;
  allowedOrigins: string[];
  backend: CheckoutBackend | null;
}
export async function handleCheckoutPrepare(
  req: Request,
  options: CheckoutOptions,
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
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), { status, headers });
  if (origin && !options.allowedOrigins.includes(origin))
    return json({ error: "Origin not allowed" }, 403);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!options.enabled || !options.contractsReviewed || !options.backend)
    return json({ error: "Checkout is not available yet" }, 503);
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    return json({ error: "JSON request required" }, 415);
  let request: CheckoutRequest;
  try {
    const reader = req.body?.getReader();
    if (!reader) throw new Error("Missing request");
    let bytes = new Uint8Array(0);
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (bytes.length + value.length > 8192) {
        await reader.cancel();
        return json({ error: "Request too large" }, 413);
      }
      const combined = new Uint8Array(bytes.length + value.length);
      combined.set(bytes);
      combined.set(value, bytes.length);
      bytes = combined;
    }
    request = readCheckoutRequest(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return json({ error: "Invalid checkout information" }, 400);
  }
  try {
    const cart = await options.backend.authorizeGuestCart(request.cart_id, request.guest_token);
    if (!cart || cart.id !== request.cart_id)
      return json({ error: "Cart not found or unauthorized" }, 404);
    if (cart.status !== "active") return json({ error: "Cart is not active" }, 409);
    try {
      snapshotCart(cart.items, cart.products, cart.variants, cart.currency);
    } catch {
      return json({ error: "Cart contains items that cannot be checked out" }, 409);
    }
    const prepared = await options.backend.prepare(request);
    const checkout = readPreparedCheckout(prepared, cart.id, cart.currency);
    // Only DB-returned amounts are sent. No payment/order actions or URLs in this boundary.
    return json({ checkout, payment_initiated: false }, 200);
  } catch (error) {
    if (error instanceof CheckoutRejection)
      return json(
        {
          error:
            error.status === 404
              ? "Cart not found or unauthorized"
              : "Checkout preparation was rejected. Refresh your cart.",
        },
        error.status,
      );
    // Do not leak database diagnostics, keys, cart tokens or customer contact information.
    return json(
      { error: "Could not confirm checkout preparation. No automatic retry was made." },
      503,
    );
  }
}

import {
  CHECKOUT_CONTRACT_REVIEWED,
  checkoutUuid,
  readCheckoutRequest,
  readPreparedCheckout,
  type CheckoutDetails,
  type PreparedCheckout,
} from "./checkout-contract";
import { getGuestCartCredentialsForCheckout, getGuestCartSnapshot } from "./guest-cart";
import { DEVELOPMENT_PURCHASING, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./supabase-config";

interface CheckoutClientOptions {
  development: boolean;
  contractReviewed: boolean;
  key: string | undefined;
  endpoint: string;
  credentials: () => { cart_id: string; guest_token: string } | null;
  cart: () => {
    currency: string;
    items: { product_id: string; variant_id: string | null; quantity: number }[];
  } | null;
  storage: () => Storage;
  request: typeof fetch;
}
/** No automatic retries. An explicit retry of the same intent reuses its UUID across refreshes.
 * Only hashes and idempotency UUIDs are stored; contact details are never persisted here.
 */
export function createCheckoutPreparationClient(options: CheckoutClientOptions) {
  let pending = false;
  return async (details: CheckoutDetails): Promise<PreparedCheckout> => {
    if (!options.development || !options.contractReviewed)
      throw new Error("Checkout is not available yet.");
    if (pending) throw new Error("Checkout preparation is already in progress. Please wait.");
    pending = true;
    try {
      const credentials = options.credentials();
      const cart = options.cart();
      if (!credentials || !cart || !cart.items.length)
        throw new Error(
          "Refresh your cart before preparing checkout. Your guest cart may be empty or expired.",
        );
      if (!options.key) throw new Error("Checkout is temporarily unavailable.");
      const compositionOf = (value: NonNullable<ReturnType<CheckoutClientOptions["cart"]>>) =>
        JSON.stringify([
          value.currency,
          value.items.map((item) => [item.product_id, item.variant_id, item.quantity]).sort(),
        ]);
      const composition = compositionOf(cart);
      const candidate = readCheckoutRequest({
        ...details,
        ...credentials,
        idempotency_key: crypto.randomUUID(),
      });
      const digest = Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(
              JSON.stringify({
                ...candidate,
                idempotency_key: undefined,
                composition,
              }),
            ),
          ),
        ),
      )
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      const storageKey = `oddgrid-checkout-intents-${credentials.cart_id}`;
      let intents: Record<string, string>;
      try {
        const saved: unknown = JSON.parse(options.storage().getItem(storageKey) ?? "{}");
        if (!saved || typeof saved !== "object" || Array.isArray(saved))
          throw new Error("Invalid checkout state");
        intents = saved as Record<string, string>;
        const existing = intents[digest];
        if (existing !== undefined && !checkoutUuid(existing))
          throw new Error("Invalid checkout state");
        if (existing) candidate.idempotency_key = existing;
        else {
          intents[digest] = candidate.idempotency_key;
          options.storage().setItem(storageKey, JSON.stringify(intents));
        }
      } catch {
        throw new Error(
          "Checkout state could not be saved safely. Allow session storage and try again.",
        );
      }
      const sameSession = () => {
        const current = options.credentials();
        const currentCart = options.cart();
        return (
          current?.cart_id === credentials.cart_id &&
          current.guest_token === credentials.guest_token &&
          !!currentCart &&
          compositionOf(currentCart) === composition
        );
      };
      if (!sameSession()) throw new Error("Your cart session changed. Refresh your cart.");
      let response: Response;
      try {
        response = await options.request(options.endpoint, {
          method: "POST",
          cache: "no-store",
          headers: { apikey: options.key, "Content-Type": "application/json" },
          body: JSON.stringify(candidate),
          signal: AbortSignal.timeout(20000),
        });
      } catch {
        throw new Error(
          "Could not confirm checkout preparation. It may have completed. No automatic retry was made; an explicit retry uses the same request key.",
        );
      }
      if (!sameSession()) throw new Error("Your cart session changed. Refresh your cart.");
      const data = await response.json().catch(() => null);
      if (!sameSession()) throw new Error("Your cart session changed. Refresh your cart.");
      if (response.status === 503)
        throw new Error("Checkout is not available yet. Preparation was not confirmed.");
      if ([401, 403, 404, 409].includes(response.status))
        throw new Error(
          "Checkout was rejected. Refresh your cart; it may have expired or contain unavailable items.",
        );
      if (!response.ok || !data || data.error || data.payment_initiated !== false)
        throw new Error("Checkout preparation was not confirmed. No automatic retry was made.");
      return readPreparedCheckout(data.checkout, credentials.cart_id, cart.currency);
    } finally {
      pending = false;
    }
  };
}
export const prepareGuestCheckout = createCheckoutPreparationClient({
  development: DEVELOPMENT_PURCHASING,
  contractReviewed: CHECKOUT_CONTRACT_REVIEWED || DEVELOPMENT_PURCHASING,
  endpoint: `${SUPABASE_URL}/functions/v1/checkout-prepare`,
  key: SUPABASE_PUBLISHABLE_KEY,
  credentials: getGuestCartCredentialsForCheckout,
  cart: () => {
    const state = getGuestCartSnapshot();
    return state.status === "ready" && state.cart
      ? { currency: state.cart.currency, items: state.items }
      : null;
  },
  storage: () => sessionStorage,
  request: (...args) => fetch(...args),
});

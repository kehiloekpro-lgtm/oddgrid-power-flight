import { DEMO_REFRIGERATOR, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./supabase-config";
import { isPurchasable, type PublicSupabaseProduct } from "./supabase-products";

type GuestCart = { cart_id: string; guest_token: string };
const STORAGE_KEY = "oddgrid-guest-cart";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let adding = false;

class CartError extends Error {
  constructor(message: string, readonly status = 0) { super(message); }
}

async function cartRequest(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!SUPABASE_PUBLISHABLE_KEY) throw new Error("Cart is not configured. Please contact OddGrid.");
  let response: Response;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/cart-api`, {
      method: "POST",
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    // A lost response can follow a successful write: never automatically retry an add.
    throw new Error("Could not confirm the cart update. Check your connection; the item may already have been added. No automatic retry was made.");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || typeof data !== "object" || data.error || data.success === false || data.ok === false) {
    throw new CartError("The server could not confirm this cart operation. The product may be unavailable or the cart may have expired.", response.status);
  }
  return data;
}

/** Tab-scoped credentials survive refreshes, without storing tokens in URLs or logs. */
function readCart(): GuestCart | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (typeof saved.cart_id === "string" && uuid.test(saved.cart_id) &&
        typeof saved.guest_token === "string" && uuid.test(saved.guest_token)) return saved;
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  } catch {
    throw new Error("Allow session storage to use a guest cart. No item was added.");
  }
}

export async function addProductToGuestCart(product: PublicSupabaseProduct): Promise<void> {
  if (adding) throw new Error("A cart update is already in progress.");
  if (!isPurchasable(product) || !uuid.test(product.id) ||
      product.id === DEMO_REFRIGERATOR.id || product.slug === DEMO_REFRIGERATOR.slug) {
    throw new Error("This product is not available for online purchase.");
  }
  adding = true;
  let checkingSavedCart = false;
  try {
    // Fail before creating a cart if credentials cannot be retained.
    try { sessionStorage.setItem(`${STORAGE_KEY}-check`, "1"); sessionStorage.removeItem(`${STORAGE_KEY}-check`); }
    catch { throw new Error("Allow session storage to use a guest cart. No item was added."); }
    let credentials = readCart();
    if (credentials) {
      checkingSavedCart = true;
      const result = await cartRequest({ action: "get_guest_cart", ...credentials });
      const cart = result.cart as { id?: string; currency?: string } | undefined;
      if (!cart || cart.id !== credentials.cart_id) throw new Error("Could not verify your guest cart. No item was added.");
      checkingSavedCart = false;
      if (cart.currency !== product.currency) throw new Error("Your existing cart uses a different currency. No item was added.");
    } else {
      const result = await cartRequest({ action: "create_guest_cart", currency: product.currency });
      const cart = result.cart as { id?: string; currency?: string } | undefined;
      if (!cart?.id || !uuid.test(cart.id) || cart.currency !== product.currency ||
          typeof result.guest_token !== "string" || !uuid.test(result.guest_token)) {
        throw new Error("Could not verify the new guest cart. No item was added.");
      }
      credentials = { cart_id: cart.id, guest_token: result.guest_token };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(credentials));
    }
    await cartRequest({ action: "add_item", ...credentials, product_id: product.id, quantity: 1 });
  } catch (error) {
    if (error instanceof CartError && (
      [401, 403].includes(error.status) ||
      (checkingSavedCart && [400, 404, 410].includes(error.status))
    )) {
      sessionStorage.removeItem(STORAGE_KEY);
      throw new Error("Your guest cart could not be accessed. Its saved credentials have been cleared. Click Add to Cart again to start a new cart.");
    }
    throw error;
  } finally { adding = false; }
}

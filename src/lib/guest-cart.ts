import { DEMO_REFRIGERATOR, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./supabase-config";
import {
  getCartCatalogueDetails,
  isPurchasable,
  type PublicSupabaseProduct,
} from "./supabase-products";

type GuestCart = { cart_id: string; guest_token: string };
export type CartItem = {
  id: string;
  product_id: string;
  variant_id: string | null;
  quantity: number;
  name?: string;
  slug?: string;
  configuration?: string;
  unitPrice?: number;
  currency?: string;
  available?: boolean;
};
export type CartSnapshot = {
  status: "idle" | "loading" | "ready" | "error";
  cart: { id: string; currency: string; status: string } | null;
  items: CartItem[];
  busy: boolean;
  message: string | null;
  detailsUnavailable: boolean;
};
const STORAGE_KEY = "oddgrid-guest-cart";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const initial: CartSnapshot = {
  status: "idle",
  cart: null,
  items: [],
  busy: false,
  message: null,
  detailsUnavailable: false,
};
let snapshot = initial;
let pending = false;
let reading: Promise<void> | null = null;
const listeners = new Set<() => void>();
export const subscribeGuestCart = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const getGuestCartSnapshot = () => snapshot;
export const getServerCartSnapshot = () => initial;
export const guestCartCount = (state: CartSnapshot) =>
  state.status === "ready" ? state.items.reduce((sum, item) => sum + item.quantity, 0) : 0;
function publish(change: Partial<CartSnapshot>) {
  snapshot = { ...snapshot, ...change };
  listeners.forEach((listener) => listener());
}

class CartError extends Error {
  constructor(
    message: string,
    readonly credentialsInvalid = false,
    readonly owner?: GuestCart,
  ) {
    super(message);
  }
}
async function cartRequest(
  body: Record<string, unknown>,
  write = false,
): Promise<Record<string, unknown>> {
  if (!SUPABASE_PUBLISHABLE_KEY)
    throw new Error("Cart is temporarily unavailable. Please try again later.");
  let response: Response;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/cart-api`, {
      method: "POST",
      cache: "no-store",
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new Error(
      write
        ? "Could not confirm the cart change. It may have completed. Refresh the cart before trying again; no automatic retry was made."
        : "Could not load your cart. Check your connection and try again.",
    );
  }
  const data = await response.json().catch(() => null);
  if (
    !response.ok ||
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    data.error ||
    data.success === false ||
    data.ok === false
  ) {
    // Exact ownership/status errors from cart-api; item-not-found is not a credential error.
    const invalid =
      data?.error === "Cart not found or unauthorized" ||
      data?.error === "Cart is not active" ||
      data?.error === "Valid cart credentials required";
    throw new CartError(
      invalid
        ? "Your guest cart has expired or is no longer accessible. Add a product to start a new cart."
        : write
          ? "The cart change was not confirmed. Refresh your cart before trying again. The item may be unavailable."
          : "Your cart could not be loaded. Please try again later.",
      invalid,
      typeof body.cart_id === "string" && typeof body.guest_token === "string"
        ? { cart_id: body.cart_id, guest_token: body.guest_token }
        : undefined,
    );
  }
  return data;
}
function readCart(): GuestCart | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (
      saved &&
      typeof saved.cart_id === "string" &&
      uuid.test(saved.cart_id) &&
      typeof saved.guest_token === "string" &&
      uuid.test(saved.guest_token)
    ) {
      return { cart_id: saved.cart_id, guest_token: saved.guest_token };
    }
    sessionStorage.removeItem(STORAGE_KEY);
    throw new CartError(
      "Saved cart credentials are invalid. Add a product to start a new cart.",
      true,
    );
  } catch (error) {
    if (error instanceof CartError) throw error;
    if (error instanceof SyntaxError) {
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        /* storage may be disabled */
      }
      throw new CartError(
        "Saved cart credentials are invalid. Add a product to start a new cart.",
        true,
      );
    }
    throw new Error("Your saved cart could not be accessed. Allow session storage and try again.");
  }
}
const sameCart = (credentials: GuestCart) => {
  const current = readCart();
  return (
    current?.cart_id === credentials.cart_id && current.guest_token === credentials.guest_token
  );
};
function fail(error: unknown) {
  if (error instanceof CartError && error.credentialsInvalid) {
    try {
      if (!error.owner || sameCart(error.owner)) sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage may be disabled or changed */
    }
  }
  publish({
    status: "error",
    cart: null,
    items: [],
    detailsUnavailable: false,
    message: error instanceof Error ? error.message : "Your cart could not be loaded.",
  });
}
async function load(credentials: GuestCart) {
  const result = await cartRequest({ action: "get_guest_cart", ...credentials });
  const cart = result.cart as CartSnapshot["cart"];
  const items = result.items as CartItem[];
  if (
    !cart ||
    cart.id !== credentials.cart_id ||
    cart.status !== "active" ||
    !["USD", "ZAR"].includes(cart.currency) ||
    !Array.isArray(items) ||
    items.some(
      (item) =>
        !item ||
        !uuid.test(item.id) ||
        !uuid.test(item.product_id) ||
        (item.variant_id !== null && !uuid.test(item.variant_id)) ||
        !Number.isSafeInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 100,
    )
  ) {
    throw new Error("The server returned an unrecognized cart. Please try again later.");
  }
  let enriched = items.map(
    ({ id, product_id, variant_id, quantity }) =>
      ({ id, product_id, variant_id, quantity }) as CartItem,
  );
  let detailsUnavailable = false;
  if (items.length) {
    try {
      enriched = await getCartCatalogueDetails(enriched, cart.currency);
    } catch {
      detailsUnavailable = true;
    }
  }
  // Never publish a response belonging to credentials that have since changed.
  if (!sameCart(credentials))
    throw new Error("Your cart session changed. Refresh the cart to continue.");
  publish({ status: "ready", cart, items: enriched, message: null, detailsUnavailable });
}
export function refreshGuestCart(): Promise<void> {
  if (reading) return reading;
  if (pending) return Promise.resolve();
  reading = (async () => {
    publish({ status: "loading", cart: null, items: [], message: null });
    try {
      const credentials = readCart();
      if (!credentials) {
        publish({ ...initial, status: "ready" });
        return;
      }
      await load(credentials);
    } catch (error) {
      fail(error);
    }
  })().finally(() => {
    reading = null;
  });
  return reading;
}
async function mutate(operation: () => Promise<void>): Promise<void> {
  if (pending || reading) throw new Error("A cart operation is already in progress. Please wait.");
  pending = true;
  publish({ busy: true, message: null });
  try {
    await operation();
  } catch (error) {
    fail(error);
    throw error;
  } finally {
    pending = false;
    publish({ busy: false });
  }
}
function verifyWrite(
  result: Record<string, unknown>,
  action: string,
  itemId?: string,
  quantity?: number,
) {
  if (
    result.success !== true ||
    result.action !== action ||
    typeof result.item_id !== "string" ||
    !uuid.test(result.item_id) ||
    (itemId && result.item_id !== itemId) ||
    (quantity !== undefined && result.quantity !== quantity)
  ) {
    throw new Error("Could not confirm the cart change. Refresh the cart before trying again.");
  }
}
export async function addProductToGuestCart(product: PublicSupabaseProduct): Promise<void> {
  if (
    !isPurchasable(product) ||
    !uuid.test(product.id) ||
    product.id === DEMO_REFRIGERATOR.id ||
    product.slug === DEMO_REFRIGERATOR.slug
  ) {
    throw new Error("This product is not available for online purchase.");
  }
  await mutate(async () => {
    let credentials = readCart();
    if (credentials) {
      await load(credentials);
      if (snapshot.cart?.currency !== product.currency)
        throw new Error("Your existing cart uses a different currency. No item was added.");
    } else {
      try {
        sessionStorage.setItem(`${STORAGE_KEY}-check`, "1");
        sessionStorage.removeItem(`${STORAGE_KEY}-check`);
      } catch {
        throw new Error("Allow session storage to use a guest cart. No item was added.");
      }
      const result = await cartRequest(
        { action: "create_guest_cart", currency: product.currency },
        true,
      );
      const cart = result.cart as CartSnapshot["cart"];
      if (
        !cart ||
        !uuid.test(cart.id) ||
        cart.status !== "active" ||
        cart.currency !== product.currency ||
        typeof result.guest_token !== "string" ||
        !uuid.test(result.guest_token)
      ) {
        throw new Error("Could not verify the new guest cart. No item was added.");
      }
      credentials = { cart_id: cart.id, guest_token: result.guest_token };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(credentials));
    }
    if (!sameCart(credentials))
      throw new Error("Your cart session changed. Refresh the cart to continue.");
    const result = await cartRequest(
      { action: "add_item", ...credentials, product_id: product.id, quantity: 1 },
      true,
    );
    verifyWrite(result, "add_item");
    if (
      !Number.isSafeInteger(result.quantity) ||
      Number(result.quantity) < 1 ||
      Number(result.quantity) > 100
    )
      throw new Error("Could not confirm the new quantity. Refresh your cart.");
    try {
      await load(credentials);
    } catch {
      throw new Error(
        "The server confirmed the cart change, but the updated cart could not be loaded. Refresh the cart before making another change.",
      );
    }
  });
}
export async function updateGuestCartQuantity(itemId: string, quantity: number): Promise<void> {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100)
    throw new Error("Quantity must be between 1 and 100.");
  await changeItem("update_quantity", itemId, quantity);
}
export async function removeGuestCartItem(itemId: string): Promise<void> {
  await changeItem("remove_item", itemId);
}
async function changeItem(
  action: "update_quantity" | "remove_item",
  itemId: string,
  quantity?: number,
) {
  await mutate(async () => {
    const credentials = readCart();
    if (
      !credentials ||
      snapshot.status !== "ready" ||
      snapshot.cart?.id !== credentials.cart_id ||
      !snapshot.items.some((item) => item.id === itemId)
    ) {
      throw new Error("Refresh your cart before changing this item.");
    }
    const result = await cartRequest(
      { action, ...credentials, item_id: itemId, ...(quantity === undefined ? {} : { quantity }) },
      true,
    );
    verifyWrite(result, action, itemId, quantity);
    try {
      await load(credentials);
    } catch {
      throw new Error(
        "The server confirmed the cart change, but the updated cart could not be loaded. Refresh the cart before making another change.",
      );
    }
  });
}

/** Keep checkout credentials out of React state and URLs; reuse the existing tab session. */
export function getGuestCartCredentialsForCheckout(): GuestCart | null {
  const credentials = readCart();
  if (
    !credentials ||
    snapshot.status !== "ready" ||
    snapshot.busy ||
    snapshot.cart?.id !== credentials.cart_id
  )
    return null;
  return credentials;
}

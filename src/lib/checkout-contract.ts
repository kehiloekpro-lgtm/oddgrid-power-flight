/** Proposed HTTP boundary, grounded in the saved checkout function arguments.
 * Not a claim that the deployed endpoint implements this contract yet.
 */
export const CHECKOUT_CONTRACT_REVIEWED = false;
export const checkoutFields = [
  "email",
  "phone",
  "shipping_recipient_name",
  "shipping_phone",
  "shipping_line1",
  "shipping_line2",
  "shipping_city",
  "shipping_region",
  "shipping_postal_code",
  "shipping_country_code",
] as const;
export type CheckoutDetails = Record<(typeof checkoutFields)[number], string>;
export type CheckoutRequest = CheckoutDetails & {
  cart_id: string;
  guest_token: string;
  idempotency_key: string;
};
export const checkoutUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function readCheckoutRequest(input: unknown): CheckoutRequest {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Invalid checkout request");
  const body = input as Record<string, unknown>;
  const allowed = new Set<string>([...checkoutFields, "cart_id", "guest_token", "idempotency_key"]);
  if (Object.keys(body).some((key) => !allowed.has(key)))
    throw new Error("Unexpected checkout fields");
  if (![body.cart_id, body.guest_token, body.idempotency_key].every(checkoutUuid))
    throw new Error("Valid guest cart credentials and idempotency key required");
  const result: Record<string, string> = {
    cart_id: body.cart_id as string,
    guest_token: body.guest_token as string,
    idempotency_key: body.idempotency_key as string,
  };
  for (const key of checkoutFields) {
    const value = body[key];
    if (
      typeof value !== "string" ||
      value.length > 250 ||
      Array.from(value).some((character) => character.charCodeAt(0) < 32)
    )
      throw new Error("Invalid contact or shipping information");
    result[key] = value.trim();
  }
  // Conservative staged form validation; DB nullability/market requirements still need review.
  if (checkoutFields.some((key) => key !== "shipping_line2" && !result[key]))
    throw new Error("Complete the contact and shipping fields");
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email) ||
    !/^[A-Z]{2}$/.test(result.shipping_country_code)
  )
    throw new Error("Enter a valid email and two-letter country code");
  return result as CheckoutRequest;
}
export interface PreparedCheckout {
  id: string;
  cart_id: string;
  currency: string;
  expires_at: string;
  subtotal: string;
  shipping_amount: string;
  tax_amount: string;
  discount_amount: string;
  total_amount: string;
}
const amountKeys = [
  "subtotal",
  "shipping_amount",
  "tax_amount",
  "discount_amount",
  "total_amount",
] as const;
export function readPreparedCheckout(
  input: unknown,
  cartId: string,
  currency: string,
): PreparedCheckout {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Checkout was not confirmed");
  const value = input as Record<string, unknown>;
  if (
    !checkoutUuid(value.id) ||
    value.cart_id !== cartId ||
    value.currency !== currency ||
    !["USD", "ZAR"].includes(currency) ||
    typeof value.expires_at !== "string" ||
    !Number.isFinite(Date.parse(value.expires_at)) ||
    Date.parse(value.expires_at) <= Date.now() ||
    amountKeys.some(
      (key) => typeof value[key] !== "string" || !/^\d{1,10}\.\d{2}$/.test(value[key] as string),
    ) ||
    value.total_amount === "0.00"
  )
    throw new Error("Checkout was not confirmed");
  // Allowlist only: never propagate guest tokens, addresses, payment URLs or service data.
  return Object.fromEntries(
    ["id", "cart_id", "currency", "expires_at", ...amountKeys].map((key) => [key, value[key]]),
  ) as unknown as PreparedCheckout;
}

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useGuestCart } from "@/hooks/use-guest-cart";
import { refreshGuestCart } from "@/lib/guest-cart";
import { DEVELOPMENT_PURCHASING } from "@/lib/supabase-config";
import { prepareGuestCheckout } from "@/lib/checkout-prepare";
import {
  CHECKOUT_CONTRACT_REVIEWED,
  checkoutFields,
  requiredCheckoutFields,
  type CheckoutDetails,
  type PreparedCheckout,
} from "@/lib/checkout-contract";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Checkout preparation — OddGrid" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CheckoutPage,
});
const labels: Record<keyof CheckoutDetails, string> = {
  email: "Email",
  phone: "Contact phone (optional)",
  shipping_recipient_name: "Recipient name",
  shipping_phone: "Delivery phone (optional)",
  shipping_line1: "Address line 1",
  shipping_line2: "Address line 2 (optional)",
  shipping_city: "City",
  shipping_region: "Region / state (optional)",
  shipping_postal_code: "Postal code (optional)",
  shipping_country_code: "Country code (two letters)",
};
function CheckoutPage() {
  const { status, cart, items, busy, message } = useGuestCart();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<PreparedCheckout | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const revision = JSON.stringify([
    cart?.id,
    items.map((item) => [item.product_id, item.variant_id, item.quantity]),
  ]);
  useEffect(() => {
    setPrepared(null);
  }, [revision]);
  useEffect(() => {
    if (!prepared) return;
    const timer = setTimeout(
      () => {
        setPrepared(null);
        setError("This checkout session has expired. Preparation is no longer confirmed.");
      },
      Math.max(0, Math.min(Date.parse(prepared.expires_at) - Date.now(), 2147483647)),
    );
    return () => clearTimeout(timer);
  }, [prepared]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    setPrepared(null);
    const form = new FormData(event.currentTarget);
    try {
      const details = Object.fromEntries(
        checkoutFields.map((key) => [key, String(form.get(key) ?? "")]),
      ) as CheckoutDetails;
      const result = await prepareGuestCheckout(details);
      if (mounted.current) setPrepared(result);
    } catch (failure) {
      if (mounted.current)
        setError(failure instanceof Error ? failure.message : "Checkout was not confirmed.");
    } finally {
      inFlight.current = false;
      if (mounted.current) setSubmitting(false);
    }
  }
  const ready = status === "ready" && items.length > 0;
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-semibold">Checkout preparation</h1>
      <Link to="/cart" className="mt-4 inline-block text-primary underline">
        Back to cart
      </Link>
      <p role="status" className="glass my-6 rounded-2xl p-6">
        {DEVELOPMENT_PURCHASING
          ? "Development checkout test. Synthetic inventory only. No orders or payments are accepted."
          : "Checkout is not available yet. No orders or payments are being accepted."}
      </p>
      {DEVELOPMENT_PURCHASING && (
        <>
          {(status === "idle" || status === "loading") && (
            <p role="status">Loading your guest cart…</p>
          )}
          {status === "error" && (
            <div role="alert">
              <p>{message}</p>
              <button
                type="button"
                onClick={() => void refreshGuestCart()}
                className="mt-3 underline"
              >
                Refresh cart
              </button>
            </div>
          )}
          {status === "ready" && !items.length && (
            <p>
              Your cart is empty.{" "}
              <Link to="/back-up-power" className="text-primary underline">
                Browse the catalogue
              </Link>
            </p>
          )}
          {ready && (
            <>
              <ul className="my-6 space-y-3" aria-label="Checkout items">
                {items.map((item) => (
                  <li key={item.id} className="glass rounded-xl p-4">
                    <p>
                      {item.name ?? "Product details unavailable"} · Quantity {item.quantity}
                    </p>
                    {item.variant_id && (
                      <p className="mt-1 text-sm">
                        Configuration:{" "}
                        {item.configuration ?? "Selected configuration details unavailable"}
                      </p>
                    )}
                    {item.available !== true && (
                      <p className="mt-2 text-sm text-amber-400">
                        Item eligibility must be confirmed before checkout.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
              <p className="text-sm text-muted-foreground">
                Final amounts will appear only after the server confirms a checkout session.
              </p>
              <form onSubmit={submit} className="mt-8">
                <fieldset
                  disabled={
                    !(CHECKOUT_CONTRACT_REVIEWED || DEVELOPMENT_PURCHASING) || submitting || busy
                  }
                  className="grid gap-4 sm:grid-cols-2"
                >
                  <legend className="mb-4 text-xl font-semibold">
                    Contact and delivery information
                  </legend>
                  {checkoutFields.map((key) => (
                    <label key={key} className="flex flex-col gap-2 text-sm">
                      {labels[key]}
                      <input
                        name={key}
                        type={key === "email" ? "email" : key.includes("phone") ? "tel" : "text"}
                        required={requiredCheckoutFields.has(key)}
                        maxLength={key === "shipping_country_code" ? 2 : 250}
                        pattern={key === "shipping_country_code" ? "[A-Z]{2}" : undefined}
                        className="rounded-xl border border-border bg-background px-4 py-3 disabled:opacity-50"
                      />
                    </label>
                  ))}
                  <button
                    type="submit"
                    className="rounded-xl bg-primary px-6 py-3 text-primary-foreground disabled:opacity-50"
                  >
                    {submitting ? "Preparing…" : "Prepare checkout (no payment)"}
                  </button>
                </fieldset>
              </form>
            </>
          )}
          {error && (
            <p role="alert" className="mt-6">
              {error}
            </p>
          )}
          {prepared && (
            <div role="status" className="glass mt-6 rounded-2xl p-6">
              <h2 className="text-xl font-semibold">Checkout session prepared</h2>
              <p>No payment was initiated. This is not an order.</p>
              <dl className="mt-4 grid grid-cols-2 gap-2">
                {[
                  ["Subtotal", prepared.subtotal],
                  ["Shipping", prepared.shipping_amount],
                  ["Tax", prepared.tax_amount],
                  ["Discount", prepared.discount_amount],
                  ["Total", prepared.total_amount],
                ].map(([label, amount]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>
                      {prepared.currency} {amount}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-sm">
                Session expires: {new Date(prepared.expires_at).toLocaleString()}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

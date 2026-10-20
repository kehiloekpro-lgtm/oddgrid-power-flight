import { createFileRoute, Link } from "@tanstack/react-router";
import { useGuestCart } from "@/hooks/use-guest-cart";
import { refreshGuestCart, removeGuestCartItem, updateGuestCartQuantity } from "@/lib/guest-cart";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [{ title: "Shopping Cart — OddGrid" }, { name: "robots", content: "noindex" }],
  }),
  component: CartPage,
});

function CartPage() {
  const { status, items, cart, busy, message, detailsUnavailable } = useGuestCart();
  // The shared store displays errors; handlers catch rejected promises without retrying writes.
  const change = (operation: Promise<void>) => {
    void operation.catch(() => {});
  };
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold sm:text-4xl">Your shopping cart</h1>
        <Link to="/back-up-power" className="text-sm text-primary underline">
          Continue shopping
        </Link>
      </div>
      {(status === "idle" || status === "loading") && (
        <p role="status" className="py-12">
          Loading your cart…
        </p>
      )}
      {status === "error" && (
        <div role="alert" className="my-8 rounded-2xl border border-border p-6">
          <p>{message}</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void refreshGuestCart()}
            className="mt-4 rounded-lg border border-border px-4 py-2 disabled:opacity-50"
          >
            Refresh cart
          </button>
        </div>
      )}
      {status === "ready" && (
        <>
          {items.length === 0 ? (
            <div className="glass my-8 rounded-3xl p-10 text-center">
              <h2 className="text-xl font-semibold">Your cart is empty</h2>
              <p className="mt-3 text-muted-foreground">
                Browse our catalogue to explore OddGrid products.
              </p>
              <Link
                to="/back-up-power"
                className="mt-6 inline-block rounded-xl bg-primary px-5 py-3 text-primary-foreground"
              >
                Browse backup power
              </Link>
            </div>
          ) : (
            <>
              {cart && (
                <p className="mt-4 text-sm text-muted-foreground">Cart currency: {cart.currency}</p>
              )}
              {detailsUnavailable && (
                <p role="status" className="mt-4">
                  Product details are temporarily unavailable. Your saved items are shown below;
                  prices have not been substituted.
                </p>
              )}
              <ul className="mt-8 space-y-4" aria-label="Cart items" aria-busy={busy}>
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="glass flex flex-col gap-5 rounded-2xl p-5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      {item.slug ? (
                        <Link
                          to="/products/$productId"
                          params={{ productId: item.slug }}
                          className="text-lg font-semibold hover:text-primary"
                        >
                          {item.name}
                        </Link>
                      ) : (
                        <h2 className="font-semibold">Product details unavailable</h2>
                      )}
                      {!item.name && (
                        <p className="mt-1 break-all text-xs text-muted-foreground">
                          Product reference: {item.product_id}
                        </p>
                      )}
                      {item.variant_id && (
                        <p className="mt-2 text-sm">
                          Configuration: {item.configuration ?? `Unavailable (${item.variant_id})`}
                        </p>
                      )}
                      {item.available === false && (
                        <p className="mt-2 text-sm text-amber-400">
                          Currently unavailable for online purchase. You can remove this item.
                        </p>
                      )}
                      <p className="mt-2 text-sm">
                        {item.unitPrice !== undefined && item.currency
                          ? `${new Intl.NumberFormat(item.currency === "ZAR" ? "en-ZA" : "en-US", { style: "currency", currency: item.currency }).format(item.unitPrice)} ${item.currency} each · current catalogue price`
                          : "Price unavailable"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-3">
                      <div className="flex items-center gap-3 rounded-xl border border-border p-1">
                        <button
                          type="button"
                          aria-label={`Decrease quantity of ${item.name ?? "product"}`}
                          disabled={busy || item.quantity <= 1}
                          onClick={() =>
                            change(updateGuestCartQuantity(item.id, item.quantity - 1))
                          }
                          className="size-10 rounded-lg hover:bg-secondary disabled:opacity-40"
                        >
                          −
                        </button>
                        <span aria-label="Quantity" className="min-w-6 text-center">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          aria-label={`Increase quantity of ${item.name ?? "product"}`}
                          disabled={busy || item.quantity >= 100 || item.available !== true}
                          onClick={() =>
                            change(updateGuestCartQuantity(item.id, item.quantity + 1))
                          }
                          className="size-10 rounded-lg hover:bg-secondary disabled:opacity-40"
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => change(removeGuestCartItem(item.id))}
                        className="rounded-lg px-3 py-2 text-sm underline disabled:opacity-40"
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-sm text-muted-foreground">
                Prices are read from the catalogue. Cart totals, shipping and final pricing are not
                available here yet.
              </p>
            </>
          )}
          {busy && (
            <p role="status" className="mt-4">
              Updating your cart…
            </p>
          )}
          <div className="mt-8 border-t border-border pt-6">
            <button type="button" disabled className="rounded-xl bg-secondary px-6 py-3 opacity-60">
              Checkout unavailable
            </button>
            <p className="mt-3 text-sm text-muted-foreground">
              Checkout is not yet available. No orders or payments are being accepted.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

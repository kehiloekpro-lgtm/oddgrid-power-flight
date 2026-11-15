import { useState } from "react";
import { getGuestCartCredentialsForCheckout } from "@/lib/guest-cart";
import {
  capturePaypalPayment,
  getPaypalPaymentStatus,
  startPaypalPayment,
  type CapturedPayment,
} from "@/lib/paypal-payment";

const paymentKey = (checkoutId: string) => `oddgrid-paypal-payment-${checkoutId}`;
const intentKey = (checkoutId: string) => `oddgrid-paypal-intent-${checkoutId}`;

/** Sandbox only. One persistent intent UUID per checkout session so a retry never double-creates. */
export function PaypalSandboxPanel({
  checkoutId,
  currency,
}: {
  checkoutId: string;
  currency: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approvalUrl, setApprovalUrl] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(paymentKey(checkoutId));
    } catch {
      return null;
    }
  });
  const [result, setResult] = useState<CapturedPayment | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);

  if (currency !== "USD")
    return (
      <p role="status" className="glass mt-6 rounded-2xl p-6">
        PayPal Sandbox needs a USD cart. This cart is in {currency}.
      </p>
    );

  async function run(task: (token: string) => Promise<void>) {
    if (busy) return;
    const credentials = getGuestCartCredentialsForCheckout();
    if (!credentials) {
      setError("Refresh your cart before paying. Your guest cart session is not ready.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await task(credentials.guest_token);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Payment was not confirmed.");
    } finally {
      setBusy(false);
    }
  }

  const start = () =>
    run(async (guest_token) => {
      let key = sessionStorage.getItem(intentKey(checkoutId));
      if (!key) {
        key = crypto.randomUUID();
        sessionStorage.setItem(intentKey(checkoutId), key);
      }
      const started = await startPaypalPayment({
        data: { checkout_id: checkoutId, guest_token, idempotency_key: key },
      });
      sessionStorage.setItem(paymentKey(checkoutId), started.payment_id);
      setPaymentId(started.payment_id);
      setApprovalUrl(started.approval_url);
      window.open(started.approval_url, "_blank", "noopener,noreferrer");
    });

  const capture = () =>
    run(async (guest_token) => {
      if (!paymentId) throw new Error("Start the payment first.");
      setResult(await capturePaypalPayment({ data: { payment_id: paymentId, guest_token } }));
    });

  const check = () =>
    run(async (guest_token) => {
      if (!paymentId) throw new Error("Start the payment first.");
      const status = await getPaypalPaymentStatus({ data: { payment_id: paymentId, guest_token } });
      setStatusText(
        `Status: ${status.payment_status}${status.order_id ? ` · Order ${status.order_id}` : ""}${
          status.reconciliation_required ? " · needs reconciliation" : ""
        }`,
      );
    });

  const button = "rounded-xl bg-primary px-6 py-3 text-primary-foreground disabled:opacity-50";
  return (
    <div className="glass mt-6 rounded-2xl p-6" aria-live="polite">
      <h2 className="text-xl font-semibold">Pay with PayPal (Sandbox)</h2>
      <p className="mt-2 text-sm">
        Test payments only. Use a PayPal sandbox buyer account. No real money moves.
      </p>
      {result ? (
        <p role="status" className="mt-4">
          Payment captured. Order {result.order_id} · {result.currency} {result.amount}
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" className={button} disabled={busy} onClick={() => void start()}>
            {busy ? "Working…" : paymentId ? "Reopen PayPal approval" : "Pay with PayPal"}
          </button>
          {paymentId && (
            <>
              <button
                type="button"
                className={button}
                disabled={busy}
                onClick={() => void capture()}
              >
                I approved it. Complete payment
              </button>
              <button
                type="button"
                className="underline"
                disabled={busy}
                onClick={() => void check()}
              >
                Check status
              </button>
            </>
          )}
        </div>
      )}
      {approvalUrl && !result && (
        <p className="mt-3 text-sm">
          PayPal opens in a new tab. After approving, you will land on a plain message page. Close
          it and return here.
        </p>
      )}
      {statusText && <p className="mt-3 text-sm">{statusText}</p>}
      {error && (
        <p role="alert" className="mt-3">
          {error}
        </p>
      )}
    </div>
  );
}

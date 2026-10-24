/** Staged Sandbox verification boundary only. No capture, attempts or finalization. */
export interface SandboxVerificationInput {
  webhookId: string;
  accessToken: string;
  headers: Headers;
  event: Record<string, unknown>;
}
export async function verifySandboxWebhook(
  input: SandboxVerificationInput,
  request: typeof fetch = fetch,
): Promise<boolean> {
  const names = [
    "paypal-auth-algo",
    "paypal-cert-url",
    "paypal-transmission-id",
    "paypal-transmission-sig",
    "paypal-transmission-time",
  ];
  if (!input.webhookId || !input.accessToken || names.some((name) => !input.headers.get(name)))
    return false;
  // No certificate fetch or caller-supplied provider URL. PayPal verifies the signature.
  let cert: URL;
  try {
    cert = new URL(input.headers.get("paypal-cert-url")!);
  } catch {
    return false;
  }
  if (
    cert.protocol !== "https:" ||
    cert.hostname !== "api.sandbox.paypal.com" ||
    cert.username ||
    cert.password ||
    cert.port
  )
    return false;
  try {
    const response = await request(
      "https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          auth_algo: input.headers.get(names[0]),
          cert_url: cert.href,
          transmission_id: input.headers.get(names[2]),
          transmission_sig: input.headers.get(names[3]),
          transmission_time: input.headers.get(names[4]),
          webhook_id: input.webhookId,
          webhook_event: input.event,
        }),
        signal: AbortSignal.timeout(15000),
      },
    );
    return response.ok && (await response.json()).verification_status === "SUCCESS";
  } catch {
    return false;
  }
}
/** Pure reconciliation check AFTER signature verification. DB event replay protection,
 * provider order/merchant mapping and finalization integration remain separate work. */
export function sandboxCaptureMatches(
  event: Record<string, unknown>,
  expected: { captureId: string; currency: string; amount: string; merchantId: string },
): boolean {
  const resource = event.resource as
    | {
        id?: string;
        status?: string;
        amount?: { currency_code?: string; value?: string };
        payee?: { merchant_id?: string };
      }
    | undefined;
  return (
    event.event_type === "PAYMENT.CAPTURE.COMPLETED" &&
    resource?.status === "COMPLETED" &&
    resource.id === expected.captureId &&
    resource.amount?.currency_code === expected.currency &&
    resource.amount?.value === expected.amount &&
    resource.payee?.merchant_id === expected.merchantId
  );
}

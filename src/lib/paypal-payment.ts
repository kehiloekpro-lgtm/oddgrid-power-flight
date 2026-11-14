import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Development-only PayPal Sandbox bridge. These run on the app server, never in
 * the browser,
 * so the function's application key stays private and no browser Origin header is
 * sent.
 * Customer-facing code only receives an allowlisted subset of each reply.
 */

const FUNCTION_URL = "https://ogbnpvroaafgpnlxeftw.supabase.co/functions/v1/paypal-sandbox";

const uuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Invalid identifier");

export interface StartedPayment {
  payment_id: string;
  approval_url: string;
}

export interface CapturedPayment {
  order_id: string;
  payment_status: "captured";
  currency: string;
  amount: string;
}

export interface PaymentStatus {
  payment_id: string;
  payment_status: string;
  order_id: string | null;
  reconciliation_required: boolean;
}

async function callPaypalFunction(body: Record<string, string>): Promise<Record<string, unknown>> {
  if (!import.meta.env.DEV) throw new Error("Sandbox payments are not available.");

  const key = process.env.ODDGRID_PAYPAL_APPLICATION_KEY;

  if (!key) throw new Error("Sandbox payments are not configured on this server.");

  let response: Response;
  try {
    response = await fetch(FUNCTION_URL, {
      method: "POST",
      cache: "no-store",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new Error("Could not reach the payment service. Nothing was confirmed; check status.");
  }

  const data = await response.json().catch(() => null);

  if (response.status === 503)
    throw new Error("Sandbox payments are switched off on the payment service.");

  if (!response.ok || !data || typeof data !== "object" || Array.isArray(data) || data.error)
    throw new Error("The payment was not confirmed. Check its status before trying again.");

  return data as Record<string, unknown>;
}

const isSandboxApproval = (value: unknown): value is string => {
  if (typeof value !== "string") return false;

  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith("sandbox.paypal.com");
  } catch {
    return false;
  }
};

export const startPaypalPayment = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ checkout_id: uuid, guest_token: uuid, idempotency_key: uuid }).strict(),
  )
  .handler(async ({ data }): Promise<StartedPayment> => {
    const reply = await callPaypalFunction({ action: "prepare", ...data });

    if (typeof reply.payment_id !== "string" || !isSandboxApproval(reply.approval_url))
      throw new Error("The payment service returned an unexpected reply.");

    return { payment_id: reply.payment_id, approval_url: reply.approval_url };
  });

export const capturePaypalPayment = createServerFn({ method: "POST" })
  .inputValidator(z.object({ payment_id: uuid, guest_token: uuid }).strict())
  .handler(async ({ data }): Promise<CapturedPayment> => {
    const reply = await callPaypalFunction({ action: "capture", ...data });

    if (
      reply.payment_status !== "captured" ||
      typeof reply.order_id !== "string" ||
      typeof reply.currency !== "string" ||
      typeof reply.amount !== "string"
    )
      throw new Error("The payment was not confirmed. Check its status before trying again.");

    return {
      order_id: reply.order_id,
      payment_status: "captured",
      currency: reply.currency,
      amount: reply.amount,
    };
  });

export const getPaypalPaymentStatus = createServerFn({ method: "POST" })
  .inputValidator(z.object({ payment_id: uuid, guest_token: uuid }).strict())
  .handler(async ({ data }): Promise<PaymentStatus> => {
    const reply = await callPaypalFunction({ action: "status", ...data });

    if (typeof reply.payment_id !== "string" || typeof reply.payment_status !== "string")
      throw new Error("The payment service returned an unexpected reply.");

    return {
      payment_id: reply.payment_id,
      payment_status: reply.payment_status,
      order_id: typeof reply.order_id === "string" ? reply.order_id : null,
      reconciliation_required: reply.reconciliation_required === true,
    };
  });

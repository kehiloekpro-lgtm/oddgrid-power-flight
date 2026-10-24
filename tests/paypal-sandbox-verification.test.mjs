import { test } from "node:test";
import assert from "node:assert/strict";
import { moduleUrl } from "./purchasing-modules.mjs";
const { verifySandboxWebhook, sandboxCaptureMatches } = await import(
  moduleUrl("backend/payments/paypal-sandbox-verification.ts")
);
const event = {
  event_type: "PAYMENT.CAPTURE.COMPLETED",
  resource: {
    id: "capture-test",
    status: "COMPLETED",
    amount: { currency_code: "ZAR", value: "651.00" },
    payee: { merchant_id: "merchant-test" },
  },
};
const expected = {
  captureId: "capture-test",
  currency: "ZAR",
  amount: "651.00",
  merchantId: "merchant-test",
};
const headers = new Headers({
  "paypal-auth-algo": "SHA256withRSA",
  "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/test",
  "paypal-transmission-id": "test",
  "paypal-transmission-sig": "signature",
  "paypal-transmission-time": "2026-10-24T10:00:00Z",
});
test("Sandbox verification sends only to fixed Sandbox verification endpoint", async () => {
  let calls = 0;
  const passed = await verifySandboxWebhook(
    { webhookId: "test-webhook", accessToken: "test-token", headers, event },
    async (url, options) => {
      calls++;
      assert.equal(
        url,
        "https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature",
      );
      assert.deepEqual(JSON.parse(options.body).webhook_event, event);
      return Response.json({ verification_status: "SUCCESS" });
    },
  );
  assert.equal(passed, true);
  assert.equal(calls, 1);
});
test("invalid provider replies, missing headers, unknown certificate origin and network failures fail closed", async () => {
  for (const reply of [
    Response.json({ verification_status: "FAILURE" }),
    Response.json({ verification_status: "SUCCESS" }, { status: 401 }),
    new Response("bad"),
  ])
    assert.equal(
      await verifySandboxWebhook(
        { webhookId: "x", accessToken: "x", headers, event },
        async () => reply,
      ),
      false,
    );
  for (const origin of ["https://evil.test/cert", "https://api.paypal.com/cert"]) {
    const h = new Headers(headers);
    h.set("paypal-cert-url", origin);
    assert.equal(
      await verifySandboxWebhook(
        { webhookId: "x", accessToken: "x", headers: h, event },
        async () => {
          throw Error("Must not fetch");
        },
      ),
      false,
    );
  }
  assert.equal(
    await verifySandboxWebhook({ webhookId: "x", accessToken: "x", headers: new Headers(), event }),
    false,
  );
  assert.equal(
    await verifySandboxWebhook({ webhookId: "x", accessToken: "x", headers, event }, async () => {
      throw Error("network");
    }),
    false,
  );
});
test("amount, currency, capture, merchant, failure and cancellation mismatches rejected", () => {
  assert.equal(sandboxCaptureMatches(event, expected), true);
  for (const field of Object.keys(expected))
    assert.equal(sandboxCaptureMatches(event, { ...expected, [field]: "wrong" }), false);
  for (const type of [
    "PAYMENT.CAPTURE.DENIED",
    "CHECKOUT.ORDER.APPROVED",
    "PAYMENT.CAPTURE.REFUNDED",
  ])
    assert.equal(sandboxCaptureMatches({ ...event, event_type: type }, expected), false);
  assert.equal(
    sandboxCaptureMatches(
      { ...event, resource: { ...event.resource, status: "PENDING" } },
      expected,
    ),
    false,
  );
});

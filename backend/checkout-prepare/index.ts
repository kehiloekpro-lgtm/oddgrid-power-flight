import { handleCheckoutPrepare } from "./handler.ts";
import { createSupabaseCheckoutBackend } from "./adapter.ts";

/** STAGED ONLY. Changing environment variables cannot enable checkout.
 * Explicit code/deployment approval is required AFTER the reviewed migration and isolated checks.
 */
const DEPLOYMENT_APPROVED = false;
declare const Deno: {
  serve(handler: (request: Request) => Promise<Response>): void;
  env: { get(name: string): string | undefined };
};
Deno.serve(async (request) => {
  const allowedOrigins = ["http://localhost:5173"];
  // Keep the adapter uninstantiated while disabled: no key loading or database access.
  if (!DEPLOYMENT_APPROVED)
    return handleCheckoutPrepare(request, {
      enabled: false,
      contractsReviewed: true,
      allowedOrigins,
      backend: null,
    });
  try {
    const backend = createSupabaseCheckoutBackend({
      url: Deno.env.get("SUPABASE_URL") ?? "",
      serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    });
    return await handleCheckoutPrepare(request, {
      enabled: true,
      contractsReviewed: true,
      allowedOrigins,
      backend,
    });
  } catch {
    return handleCheckoutPrepare(request, {
      enabled: false,
      contractsReviewed: true,
      allowedOrigins,
      backend: null,
    });
  }
});

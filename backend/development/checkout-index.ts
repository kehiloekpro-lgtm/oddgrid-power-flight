// STAGED: requires separate approval and an explicit Development-only deployment.
import { developmentConfiguration, developmentGateway } from "./config.ts";
import { handleCheckoutPrepare } from "../checkout-prepare/handler.ts";
import { createSupabaseCheckoutBackend } from "../checkout-prepare/adapter.ts";
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
};
Deno.serve(async (request) => {
  let config;
  try {
    config = developmentConfiguration((name) => Deno.env.get(name));
  } catch {
    return handleCheckoutPrepare(request, {
      enabled: false,
      contractsReviewed: true,
      allowedOrigins: [],
      backend: null,
    });
  }
  const rejected = developmentGateway(request, config);
  if (rejected) return rejected;
  try {
    const backend = createSupabaseCheckoutBackend({
      url: config.url,
      serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    });
    return await handleCheckoutPrepare(request, {
      enabled: true,
      contractsReviewed: true,
      allowedOrigins: config.origins,
      backend,
    });
  } catch {
    return handleCheckoutPrepare(request, {
      enabled: false,
      contractsReviewed: true,
      allowedOrigins: config.origins,
      backend: null,
    });
  }
});

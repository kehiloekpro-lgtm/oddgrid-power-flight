// STAGED: imports the existing server SDK only in the Edge runtime.
// @ts-expect-error Deno resolves pinned npm dependencies during approved bundling.
import { createClient } from "npm:@supabase/supabase-js@2.108.0";
import { developmentConfiguration, developmentGateway } from "./config.ts";
import { handleGuestCart, type CartClient } from "../cart/handler.ts";
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
};
Deno.serve(async (request) => {
  try {
    const config = developmentConfiguration((name) => Deno.env.get(name));
    const rejected = developmentGateway(request, config);
    if (rejected) return rejected;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!key) throw new Error("Disabled");
    const client = createClient(config.url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    }) as CartClient;
    return await handleGuestCart(request, { client, allowedOrigins: config.origins });
  } catch {
    return new Response(JSON.stringify({ error: "Cart is temporarily unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
});

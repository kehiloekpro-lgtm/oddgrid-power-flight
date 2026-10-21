import { handleCheckoutPrepare } from "./handler.ts";

/** STAGED ONLY — no deployment in this assignment.
 * No service adapter or activation switch until DB/expiry contracts and migrations are reviewed.
 * This entry point deliberately remains unavailable even if an environment flag is set.
 */
declare const Deno: { serve(handler: (request: Request) => Promise<Response>): void };
Deno.serve((request) =>
  handleCheckoutPrepare(request, {
    enabled: false,
    contractsReviewed: false,
    allowedOrigins: ["http://localhost:5173"],
    backend: null,
  }),
);

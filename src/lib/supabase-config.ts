/** Public Supabase configuration. Never place secret or service-role keys here. */
import { storefrontSupabaseUrl } from "./storefront-environment";
/**
 * True for the local dev server, or for a build explicitly marked as the Development sandbox
 * staging copy (VITE_ODDGRID_STAGING=development-sandbox).
 */
export const DEVELOPMENT_PREVIEW =
  import.meta.env.DEV || import.meta.env.VITE_ODDGRID_STAGING === "development-sandbox";
export const SUPABASE_URL = storefrontSupabaseUrl(
  DEVELOPMENT_PREVIEW,
  import.meta.env.VITE_ODDGRID_DEVELOPMENT_SUPABASE_URL,
);

/** Frontend key must be configured in the deployment environment, not committed. */
export const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as
  string | undefined;

export const DEVELOPMENT_PURCHASING =
  import.meta.env.DEV && SUPABASE_URL === "https://ogbnpvroaafgpnlxeftw.supabase.co";

/** Demo product is draft and must never be treated as purchasable. */
export const DEMO_REFRIGERATOR = {
  id: "a0119f06-dc03-405e-92bb-def23ad7d3e8",
  slug: "solar-fridge-210l",
  name: "210L Solar Refrigerator",
} as const;
// Branch-only Netlify preview trigger: no runtime behavior changes.
// Netlify branch redeploy trigger after authenticated specifications fix.

/** Public Supabase configuration. Never place secret or service-role keys here. */
export const SUPABASE_URL = "https://izixhjstwfgywbgrnrey.supabase.co";

/** Frontend key must be configured in the deployment environment, not committed. */
export const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/** Demo product is draft and must never be treated as purchasable. */
export const DEMO_REFRIGERATOR = {
  id: "a0119f06-dc03-405e-92bb-def23ad7d3e8",
  slug: "solar-fridge-210l",
  name: "210L Solar Refrigerator",
} as const;

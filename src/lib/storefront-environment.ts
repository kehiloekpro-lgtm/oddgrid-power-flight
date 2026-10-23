/** Keep production fixed; permit an explicitly selected local Development preview. */
export const ODDGRID_PRODUCTION_URL = "https://izixhjstwfgywbgrnrey.supabase.co";
export const ODDGRID_DEVELOPMENT_URL = "https://ogbnpvroaafgpnlxeftw.supabase.co";

export function storefrontSupabaseUrl(development: boolean, override?: string): string {
  if (!override) return ODDGRID_PRODUCTION_URL;
  if (!development || override.replace(/\/$/, "") !== ODDGRID_DEVELOPMENT_URL)
    throw new Error("Supabase override is restricted to the approved local Development preview");
  return ODDGRID_DEVELOPMENT_URL;
}

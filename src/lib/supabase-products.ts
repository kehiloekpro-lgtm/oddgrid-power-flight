import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./supabase-config";

export interface PublicSupabaseProduct {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  currency: string;
  selling_price: number | null;
  sale_type: "direct" | "rfq";
  status: "active";
  availability: string;
}

/**
 * Public catalogue lookup only. Draft records are intentionally excluded.
 * Supabase RLS must independently enforce the same restriction; a client filter
 * is not an authorization boundary.
 */
export async function getPublishedProductBySlug(slug: string): Promise<PublicSupabaseProduct | null> {
  if (!SUPABASE_PUBLISHABLE_KEY) throw new Error("Missing VITE_SUPABASE_PUBLISHABLE_KEY");
  const url = new URL(`${SUPABASE_URL}/rest/v1/products`);
  url.searchParams.set("select", "id,name,slug,sku,currency,selling_price,sale_type,status,availability");
  url.searchParams.set("slug", `eq.${slug}`);
  url.searchParams.set("status", "eq.active");
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Supabase catalogue request failed (${response.status})`);
  const rows = (await response.json()) as PublicSupabaseProduct[];
  return rows[0] ?? null;
}

/** No public purchase until product is active, priced and explicitly direct-sale. */
export function isPurchasable(product: PublicSupabaseProduct | null): boolean {
  return !!product && product.status === "active" && product.sale_type === "direct" &&
    typeof product.selling_price === "number" && Number.isFinite(product.selling_price) &&
    product.selling_price > 0 && product.availability === "confirmed_available";
}

/** Read only active, non-discontinued products. Supabase RLS enforces public access. */
export async function listPublishedProducts(): Promise<PublicSupabaseProduct[]> {
  if (!SUPABASE_PUBLISHABLE_KEY) throw new Error("Missing VITE_SUPABASE_PUBLISHABLE_KEY");
  const url = new URL(`${SUPABASE_URL}/rest/v1/products`);
  url.searchParams.set("select", "id,name,slug,sku,currency,selling_price,sale_type,status,availability");
  url.searchParams.set("status", "eq.active");
  url.searchParams.set("availability", "neq.discontinued");
  url.searchParams.set("order", "name.asc");
  url.searchParams.set("limit", "100");
  const response = await fetch(url, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Supabase catalogue request failed (${response.status})`);
  const rows: unknown = await response.json();
  if (!Array.isArray(rows)) throw new Error("Unexpected Supabase catalogue response");
  return (rows as PublicSupabaseProduct[]).filter((item) =>
    item && item.status === "active" && item.availability !== "discontinued"
  );
}

/** Format only approved database selling prices, never placeholder prices. */
export function displaySellingPrice(product: PublicSupabaseProduct): string | null {
  if (typeof product.selling_price !== "number" || !Number.isFinite(product.selling_price) || product.selling_price <= 0) return null;
  if (!/^[A-Z]{3}$/.test(product.currency)) return null;
  try {
    return new Intl.NumberFormat(product.currency === "ZAR" ? "en-ZA" : "en-US", {
      style: "currency", currency: product.currency, maximumFractionDigits: 2,
    }).format(product.selling_price);
  } catch {
    return null;
  }
}

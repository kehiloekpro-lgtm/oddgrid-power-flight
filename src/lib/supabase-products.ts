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
  category_id?: string | null;
  brand_id?: string | null;
  description?: string | null;
  model?: string | null;
  warranty_summary?: string | null;
}

/**
 * Public catalogue lookup only. Draft records are intentionally excluded.
 * Supabase RLS must independently enforce the same restriction; a client filter
 * is not an authorization boundary.
 */
export async function getPublishedProductBySlug(slug: string): Promise<PublicSupabaseProduct | null> {
  if (!SUPABASE_PUBLISHABLE_KEY) throw new Error("Missing VITE_SUPABASE_PUBLISHABLE_KEY");
  const url = new URL(`${SUPABASE_URL}/rest/v1/products`);
  url.searchParams.set("select", "id,name,slug,sku,currency,selling_price,sale_type,status,availability,category_id,brand_id,description,model,warranty_summary");
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
  url.searchParams.set("select", "id,name,slug,sku,currency,selling_price,sale_type,status,availability,category_id,brand_id,description,model,warranty_summary");
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

/** Read-only catalogue relationships. Public RLS policies restrict returned rows. */
async function publicCatalogueRows<T>(table: string, query: Record<string, string>): Promise<T[]> {
  if (!SUPABASE_PUBLISHABLE_KEY) throw new Error("Missing VITE_SUPABASE_PUBLISHABLE_KEY");
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Supabase ${table} request failed (${response.status})`);
  const rows: unknown = await response.json();
  if (!Array.isArray(rows)) throw new Error("Unexpected Supabase response");
  return rows as T[];
}

export interface PublicCategory {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  is_active: boolean;
}

export interface PublicBrand {
  id: string;
  name: string;
  slug: string;
}

export interface PublicProductImage {
  id: string;
  product_id: string;
  storage_path: string | null;
  external_url: string | null;
  alt_text: string | null;
  display_order: number;
  is_primary: boolean;
}

export interface PublicProductSpecSection {
  id: string;
  name: string;
  display_order: number;
}

export interface PublicProductSpec {
  id: string;
  section_id: string | null;
  parent_spec_id: string | null;
  label: string;
  value: string | null;
  display_order: number;
}

export function listPublicCategories(): Promise<PublicCategory[]> {
  return publicCatalogueRows("categories", {
    select: "id,name,slug,parent_id,is_active", is_active: "eq.true",
    order: "display_order.asc", limit: "200",
  });
}

export function listPublicBrands(): Promise<PublicBrand[]> {
  return publicCatalogueRows("brands", {
    select: "id,name,slug", is_active: "eq.true", limit: "200",
  });
}

export async function getPublicProductDetails(productId: string): Promise<{
  images: PublicProductImage[];
  sections: PublicProductSpecSection[];
  specs: PublicProductSpec[];
}> {
  const [images, sections, specs] = await Promise.all([
    publicCatalogueRows<PublicProductImage>("product_images", {
      select: "id,product_id,storage_path,external_url,alt_text,display_order,is_primary",
      product_id: `eq.${productId}`, order: "display_order.asc",
    }),
    publicCatalogueRows<PublicProductSpecSection>("product_spec_sections", {
      select: "id,name,display_order", product_id: `eq.${productId}`, order: "display_order.asc",
    }),
    publicCatalogueRows<PublicProductSpec>("product_specs", {
      select: "id,section_id,parent_spec_id,label,value,display_order",
      product_id: `eq.${productId}`, order: "display_order.asc",
    }),
  ]);
  return { images, sections, specs };
}

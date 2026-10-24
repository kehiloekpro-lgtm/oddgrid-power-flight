import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./supabase-config";

export interface PublicSupabaseProduct {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  currency: string;
  selling_price: number | null;
  sale_type: "direct" | "rfq";
  status: "active" | "draft";
  availability: string;
  category_id?: string | null;
  brand_id?: string | null;
  description?: string | null;
  model?: string | null;
  warranty_summary?: string | null;
}

export interface PublicProductVariant {
  id: string;
  product_id: string;
  variant_name: string;
  sku: string | null;
  currency: string;
  selling_price: number | null;
  availability: string;
  is_active: boolean;
}
export function isPurchasableSelection(
  product: PublicSupabaseProduct,
  variant?: PublicProductVariant | null,
): boolean {
  if (!variant) return isPurchasable(product);
  return (
    product.status === "active" &&
    product.sale_type === "direct" &&
    product.availability === "confirmed_available" &&
    variant.product_id === product.id &&
    variant.is_active &&
    variant.currency === product.currency &&
    isPurchasable({
      ...product,
      selling_price: variant.selling_price,
      availability: variant.availability,
    })
  );
}
/** RLS returns only approved customer-visible selling information. No cost fields. */
export async function listPublicProductVariants(
  productId: string,
): Promise<PublicProductVariant[]> {
  return publicCatalogueRows<PublicProductVariant>("product_variants", {
    select: "id,product_id,variant_name,sku,currency,selling_price,availability,is_active",
    product_id: `eq.${productId}`,
    is_active: "eq.true",
    order: "variant_name.asc",
  });
}

/**
 * Public catalogue lookup only. Draft records are intentionally excluded.
 * Supabase RLS must independently enforce the same restriction; a client filter
 * is not an authorization boundary.
 */
export async function getPublishedProductBySlug(
  slug: string,
): Promise<PublicSupabaseProduct | null> {
  if (!SUPABASE_PUBLISHABLE_KEY) throw new Error("Missing VITE_SUPABASE_PUBLISHABLE_KEY");
  const url = new URL(`${SUPABASE_URL}/rest/v1/products`);
  url.searchParams.set(
    "select",
    "id,name,slug,sku,currency,selling_price,sale_type,status,availability,category_id,brand_id,description,model,warranty_summary",
  );
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
  return (
    !!product &&
    product.status === "active" &&
    product.sale_type === "direct" &&
    typeof product.selling_price === "number" &&
    Number.isFinite(product.selling_price) &&
    product.selling_price > 0 &&
    product.availability === "confirmed_available"
  );
}

/** Read only active, non-discontinued products. Supabase RLS enforces public access. */
export async function listPublishedProducts(): Promise<PublicSupabaseProduct[]> {
  if (!SUPABASE_PUBLISHABLE_KEY) throw new Error("Missing VITE_SUPABASE_PUBLISHABLE_KEY");
  const url = new URL(`${SUPABASE_URL}/rest/v1/products`);
  url.searchParams.set(
    "select",
    "id,name,slug,sku,currency,selling_price,sale_type,status,availability,category_id,brand_id,description,model,warranty_summary",
  );
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
  return (rows as PublicSupabaseProduct[]).filter(
    (item) => item && item.status === "active" && item.availability !== "discontinued",
  );
}

/** Format only approved database selling prices, never placeholder prices. */
export function displaySellingPrice(product: PublicSupabaseProduct): string | null {
  if (
    typeof product.selling_price !== "number" ||
    !Number.isFinite(product.selling_price) ||
    product.selling_price <= 0
  )
    return null;
  if (!/^[A-Z]{3}$/.test(product.currency)) return null;
  try {
    return new Intl.NumberFormat(product.currency === "ZAR" ? "en-ZA" : "en-US", {
      style: "currency",
      currency: product.currency,
      maximumFractionDigits: 2,
    }).format(product.selling_price);
  } catch {
    return null;
  }
}

/** Read-only catalogue relationships. Public RLS policies restrict returned rows. */
async function publicCatalogueRows<T>(
  table: string,
  query: Record<string, string>,
  accessToken?: string,
): Promise<T[]> {
  if (!SUPABASE_PUBLISHABLE_KEY) throw new Error("Missing VITE_SUPABASE_PUBLISHABLE_KEY");
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Accept: "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
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

/** Resolve a public product image from an approved HTTPS URL or the public Storage bucket. */
export function resolvePublicProductImage(image: PublicProductImage): string | null {
  if (image.external_url) {
    try {
      const url = new URL(image.external_url);
      if (url.protocol === "https:") return url.toString();
    } catch {
      /* Ignore malformed external URLs. */
    }
  }
  const path = image.storage_path;
  if (
    !path ||
    path.startsWith("/") ||
    path.endsWith("/") ||
    path.includes("\\") ||
    path.split("/").some((segment) => !segment || segment === "." || segment === "..")
  )
    return null;
  return `${SUPABASE_URL}/storage/v1/object/public/product-images/${path.split("/").map(encodeURIComponent).join("/")}`;
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
    select: "id,name,slug,parent_id,is_active",
    is_active: "eq.true",
    order: "display_order.asc",
    limit: "200",
  });
}

export function listPublicBrands(): Promise<PublicBrand[]> {
  return publicCatalogueRows("brands", {
    select: "id,name,slug",
    is_active: "eq.true",
    limit: "200",
  });
}

export async function getPublicProductDetails(
  productId: string,
  accessToken?: string,
): Promise<{
  images: PublicProductImage[];
  sections: PublicProductSpecSection[];
  specs: PublicProductSpec[];
}> {
  const [images, sections, specs] = await Promise.all([
    publicCatalogueRows<PublicProductImage>(
      "product_images",
      {
        select: "id,product_id,storage_path,external_url,alt_text,display_order,is_primary",
        product_id: `eq.${productId}`,
        order: "display_order.asc",
      },
      accessToken,
    ),
    publicCatalogueRows<PublicProductSpecSection>(
      "product_spec_sections",
      {
        select: "id,name,display_order",
        product_id: `eq.${productId}`,
        order: "display_order.asc",
      },
      accessToken,
    ),
    publicCatalogueRows<PublicProductSpec>(
      "product_specs",
      {
        select: "id,section_id,parent_spec_id,label,value,display_order",
        product_id: `eq.${productId}`,
        order: "display_order.asc",
      },
      accessToken,
    ),
  ]);
  return { images, sections, specs };
}

/** Draft access is granted only by Supabase RLS to authorized authenticated users. */
export async function getPreviewProductById(
  id: string,
  accessToken: string,
): Promise<PublicSupabaseProduct | null> {
  const rows = await publicCatalogueRows<PublicSupabaseProduct>(
    "products",
    {
      select:
        "id,name,slug,sku,currency,selling_price,sale_type,status,availability,category_id,brand_id,description,model,warranty_summary",
      id: `eq.${id}`,
      limit: "1",
    },
    accessToken,
  );
  return rows[0] ?? null;
}

/** Public catalogue display only: never calculate or submit checkout totals here. */
export async function getCartCatalogueDetails<
  T extends { product_id: string; variant_id: string | null },
>(
  items: T[],
  cartCurrency: string,
): Promise<
  (T & {
    name?: string;
    slug?: string;
    configuration?: string;
    unitPrice?: number;
    currency?: string;
    available?: boolean;
  })[]
> {
  const ids = [...new Set(items.map((item) => item.product_id))];
  const variantIds = [
    ...new Set(items.flatMap((item) => (item.variant_id ? [item.variant_id] : []))),
  ];
  const [products, variants] = await Promise.all([
    publicCatalogueRows<PublicSupabaseProduct>("products", {
      select: "id,name,slug,currency,selling_price,sale_type,status,availability",
      id: `in.(${ids.join(",")})`,
      status: "eq.active",
    }),
    variantIds.length
      ? publicCatalogueRows<{
          id: string;
          product_id: string;
          variant_name: string;
          currency: string;
          selling_price: number | null;
          availability: string;
          is_active: boolean;
        }>("product_variants", {
          select: "id,product_id,variant_name,currency,selling_price,availability,is_active",
          id: `in.(${variantIds.join(",")})`,
        })
      : Promise.resolve([]),
  ]);
  return items.map((item) => {
    const product = products.find((row) => row.id === item.product_id);
    const variant = variants.find(
      (row) => row.id === item.variant_id && row.product_id === item.product_id,
    );
    const priced = item.variant_id ? variant : product;
    const price = priced?.selling_price;
    return {
      ...item,
      name: product?.name,
      slug: product?.slug,
      configuration: variant?.variant_name,
      unitPrice:
        typeof price === "number" &&
        Number.isFinite(price) &&
        price > 0 &&
        priced?.currency === cartCurrency
          ? price
          : undefined,
      currency: priced?.currency,
      available:
        !!product &&
        product.status === "active" &&
        product.sale_type === "direct" &&
        typeof price === "number" &&
        Number.isFinite(price) &&
        price > 0 &&
        priced?.currency === cartCurrency &&
        priced.availability === "confirmed_available" &&
        (!item.variant_id || (!!variant && variant.is_active)),
    };
  });
}

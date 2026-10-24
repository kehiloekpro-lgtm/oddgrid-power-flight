import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { addProductToGuestCart } from "@/lib/guest-cart";
import { DEMO_REFRIGERATOR } from "@/lib/supabase-config";
import { Package } from "lucide-react";
import {
  isPurchasableSelection,
  listPublicProductVariants,
  type PublicProductVariant,
  displaySellingPrice,
  getPublishedProductBySlug,
  getPublicProductDetails,
  listPublicCategories,
  resolvePublicProductImage,
  type PublicCategory,
  type PublicSupabaseProduct,
  type PublicProductImage,
  type PublicProductSpec,
  type PublicProductSpecSection,
} from "@/lib/supabase-products";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/products/$productId")({
  // Metadata is deliberately neutral until published product data can be resolved server-side.
  // Never emit fabricated prices, stock claims or structured offers from local demo JSON.
  head: () => ({
    meta: [{ title: "OddGrid Product Details" }, { name: "robots", content: "noindex" }],
  }),
  component: ProductPage,
});

function ProductPage() {
  const { productId } = Route.useParams();
  const [addingToCart, setAddingToCart] = useState(false);
  const [cartMessage, setCartMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [catalogueStatus, setCatalogueStatus] = useState<
    "loading" | "unpublished" | "published" | "error"
  >("loading");
  const [publishedProduct, setPublishedProduct] = useState<PublicSupabaseProduct | null>(null);
  const [detailImages, setDetailImages] = useState<PublicProductImage[]>([]);
  const [specs, setSpecs] = useState<PublicProductSpec[]>([]);
  const [sections, setSections] = useState<PublicProductSpecSection[]>([]);
  const [variants, setVariants] = useState<PublicProductVariant[]>([]);
  const [variantId, setVariantId] = useState("");
  const [variantError, setVariantError] = useState(false);
  const [categories, setCategories] = useState<PublicCategory[]>([]);

  useEffect(() => {
    let cancelled = false;
    setCatalogueStatus("loading");
    setCartMessage(null);
    setPublishedProduct(null);
    setDetailImages([]);
    setSpecs([]);
    setSections([]);
    setVariants([]);
    setVariantId("");
    setVariantError(false);
    setIndex(0);
    getPublishedProductBySlug(productId)
      .then(async (record) => {
        if (record) {
          const [details, categoryRows, options] = await Promise.all([
            getPublicProductDetails(record.id),
            listPublicCategories(),
            listPublicProductVariants(record.id).catch(() => null),
          ]);
          if (!cancelled) {
            setVariants(options ?? []);
            setVariantError(options === null);
            setDetailImages(details.images);
            setSpecs(details.specs);
            setSections(details.sections);
            setCategories(categoryRows);
          }
        }
        if (!cancelled) {
          setPublishedProduct(record);
          setCatalogueStatus(record ? "published" : "unpublished");
        }
      })
      .catch(() => {
        if (!cancelled) setCatalogueStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  // Prefer valid external HTTPS URLs, then the public product-images Storage bucket.
  const approvedImages = detailImages
    .filter((item) => resolvePublicProductImage(item) !== null)
    .sort(
      (a, b) => Number(b.is_primary) - Number(a.is_primary) || a.display_order - b.display_order,
    )
    .map((item) => ({
      src: resolvePublicProductImage(item)!,
      alt: item.alt_text ?? publishedProduct?.name ?? "Product",
    }));
  const gallery = approvedImages.length ? approvedImages : [];

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = frame.current?.getBoundingClientRect();
    if (!rect) return;
    setZoom({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  };

  if (catalogueStatus !== "published" || !publishedProduct) {
    const message =
      catalogueStatus === "loading"
        ? "Checking product availability…"
        : catalogueStatus === "error"
          ? "Product information is temporarily unavailable. Please try again later."
          : "This product is not currently published.";
    return (
      <main className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
        <h1 className="text-3xl font-semibold">Product unavailable</h1>
        <p role="status" className="mt-4 text-muted-foreground">
          {message}
        </p>
        <Link to="/" className="mt-6 inline-block text-primary">
          Return to OddGrid
        </Link>
      </main>
    );
  }

  const selectedVariant = variants.find((variant) => variant.id === variantId) ?? null;
  const selectedProduct = selectedVariant
    ? {
        ...publishedProduct,
        selling_price: selectedVariant.selling_price,
        currency: selectedVariant.currency,
        sku: selectedVariant.sku,
      }
    : publishedProduct;
  const selectionReady =
    !variantError &&
    (!variants.length || !!selectedVariant) &&
    isPurchasableSelection(publishedProduct, selectedVariant);
  const assignedCategory = categories.find((item) => item.id === publishedProduct.category_id);
  let parentCategory = assignedCategory;
  while (parentCategory?.parent_id) {
    const parent = categories.find((item) => item.id === parentCategory?.parent_id);
    if (!parent) break;
    parentCategory = parent;
  }
  const categoryRoutes = ["sub-zero", "solar-hvac", "back-up-power", "hybrid-inverters"];
  const categoryRoute =
    parentCategory && categoryRoutes.includes(parentCategory.slug)
      ? (parentCategory.slug as "sub-zero" | "solar-hvac" | "back-up-power" | "hybrid-inverters")
      : null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <nav className="text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          Home
        </Link>
        <span className="px-2">/</span>
        {categoryRoute && (
          <>
            <Link
              to={
                categoryRoute === "sub-zero"
                  ? "/sub-zero"
                  : categoryRoute === "solar-hvac"
                    ? "/solar-hvac"
                    : categoryRoute === "back-up-power"
                      ? "/back-up-power"
                      : "/hybrid-inverters"
              }
              className="hover:text-foreground"
            >
              {parentCategory?.name}
            </Link>
            <span className="px-2">/</span>
          </>
        )}
        <span className="px-2">/</span>
        <span className="text-foreground">{publishedProduct.name}</span>
      </nav>

      <div className="mt-8 grid gap-10 lg:grid-cols-2">
        <div>
          <div
            ref={frame}
            onMouseMove={onMove}
            onMouseLeave={() => setZoom(null)}
            className="glass relative aspect-4/3 overflow-hidden rounded-3xl bg-surface-2"
          >
            {gallery.length ? (
              <img
                src={gallery[index]?.src ?? gallery[0]?.src}
                alt={gallery[index]?.alt ?? publishedProduct.name}
                width={1200}
                height={900}
                className="h-full w-full object-cover transition-transform duration-200"
                style={
                  zoom
                    ? {
                        transform: "scale(2)",
                        transformOrigin: `${zoom.x}% ${zoom.y}%`,
                      }
                    : undefined
                }
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
                <Package className="size-16" aria-hidden="true" />
                <p>Product photograph coming soon</p>
              </div>
            )}
            {gallery.length > 0 && (
              <span className="glass pointer-events-none absolute right-4 bottom-4 rounded-full px-3 py-1 text-xs text-muted-foreground">
                Hover to zoom
              </span>
            )}
          </div>
          <div className="mt-4 flex gap-3">
            {gallery.map((img, i) => (
              <button
                key={i}
                onClick={() => setIndex(i)}
                className={cn(
                  "aspect-4/3 w-24 overflow-hidden rounded-2xl border transition-colors",
                  i === index ? "border-primary" : "border-border hover:border-primary/40",
                )}
                aria-label={`View image ${i + 1}`}
              >
                <img
                  src={img.src}
                  alt=""
                  loading="lazy"
                  width={1200}
                  height={900}
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs tracking-[0.25em] text-muted-foreground uppercase">
            {assignedCategory?.name ?? "Product"}
          </p>
          <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">{publishedProduct.name}</h1>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <span className="text-3xl font-semibold">
              {publishedProduct.sale_type === "rfq"
                ? "Price on request"
                : variants.length > 0 && !selectedVariant
                  ? "Select a configuration"
                  : (displaySellingPrice(selectedProduct) ?? "Price on request")}
            </span>
            {selectedProduct.sku && (
              <span className="text-xs text-muted-foreground">SKU {selectedProduct.sku}</span>
            )}
          </div>
          {publishedProduct.description && (
            <p className="mt-6 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {publishedProduct.description}
            </p>
          )}
          {variants.length > 0 && (
            <label className="mt-6 flex flex-col gap-2">
              Configuration
              <select
                value={variantId}
                onChange={(event) => {
                  setVariantId(event.target.value);
                  setCartMessage(null);
                }}
                disabled={addingToCart}
                className="rounded-xl border border-border bg-background px-4 py-3"
              >
                <option value="">Select a configuration</option>
                {variants.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.variant_name} —{" "}
                    {displaySellingPrice({
                      ...publishedProduct,
                      selling_price: variant.selling_price,
                      currency: variant.currency,
                    }) ?? "Price unavailable"}
                  </option>
                ))}
              </select>
            </label>
          )}
          {variantError && (
            <p role="alert" className="mt-4">
              Product configurations could not be checked. Refresh before purchasing.
            </p>
          )}
          {selectionReady &&
          publishedProduct.id !== DEMO_REFRIGERATOR.id &&
          publishedProduct.slug !== DEMO_REFRIGERATOR.slug ? (
            <button
              type="button"
              disabled={addingToCart}
              aria-busy={addingToCart}
              className="mt-6 rounded-xl bg-primary px-6 py-3 font-semibold text-primary-foreground disabled:cursor-wait disabled:opacity-60"
              onClick={async () => {
                if (addingToCart) return;
                setAddingToCart(true);
                setCartMessage(null);
                try {
                  await addProductToGuestCart(publishedProduct, selectedVariant);
                  setCartMessage({
                    ok: true,
                    text: `${publishedProduct.name} added to your cart.`,
                  });
                } catch (error) {
                  setCartMessage({
                    ok: false,
                    text:
                      error instanceof Error
                        ? error.message
                        : "Could not confirm the cart update. Please try again later.",
                  });
                } finally {
                  setAddingToCart(false);
                }
              }}
            >
              {addingToCart ? "Adding…" : "Add to Cart"}
            </button>
          ) : (
            <p className="mt-6 text-sm text-muted-foreground">
              {variants.length > 0 && !selectedVariant
                ? "Select a configuration to check purchasing eligibility."
                : "Contact OddGrid to confirm availability and purchasing options."}
            </p>
          )}
          {cartMessage && (
            <p role={cartMessage.ok ? "status" : "alert"} className="mt-4 text-sm">
              {cartMessage.text}
              {cartMessage.ok && (
                <>
                  {" "}
                  <Link to="/cart" className="text-primary underline">
                    View cart
                  </Link>
                </>
              )}
            </p>
          )}
        </div>
      </div>

      {specs.length > 0 && (
        <section className="mt-16">
          <h2 className="text-2xl font-semibold">Technical specifications</h2>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            {[
              ...sections.map((section) => ({ id: section.id, name: section.name })),
              { id: null, name: "Additional specifications" },
            ].map((section) => {
              const entries = specs.filter((spec) => spec.section_id === section.id && spec.value);
              if (!entries.length) return null;
              return (
                <div key={section.id ?? "other"} className="glass rounded-2xl p-5">
                  <h3 className="mb-4 font-semibold">{section.name}</h3>
                  <dl className="space-y-3">
                    {entries.map((spec) => (
                      <div
                        key={spec.id}
                        className="flex justify-between gap-6 border-b border-border pb-2 text-sm"
                      >
                        <dt className="text-muted-foreground">{spec.label}</dt>
                        <dd className="text-right">{spec.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

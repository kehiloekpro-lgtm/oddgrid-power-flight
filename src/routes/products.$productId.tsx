import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Download, FileText, MessageCircle, Plus, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProductCard } from "@/components/site/ProductCard";
import { Reveal } from "@/components/site/Reveal";
import {
  formatPrice,
  getProduct,
  productImages,
  relatedProducts,
  stockLabel,
  WHATSAPP_URL,
  type Product,
} from "@/lib/products";
import { useQuote } from "@/lib/quote-store";
import { DEMO_REFRIGERATOR } from "@/lib/supabase-config";
import { displaySellingPrice, getPublishedProductBySlug, type PublicSupabaseProduct } from "@/lib/supabase-products";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/products/$productId")({
  loader: ({ params }) => {
    const product = getProduct(params.productId);
    if (!product) throw notFound();
    return { product };
  },
  // Metadata is deliberately neutral until published product data can be resolved server-side.
  // Never emit fabricated prices, stock claims or structured offers from local demo JSON.
  head: () => ({
    meta: [
      { title: "OddGrid Product Details" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProductPage,
});

function ProductPage() {
  const { product } = Route.useLoaderData() as { product: Product };
  const images = productImages(product);
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const { add } = useQuote();
  const stock = stockLabel(product.stock);
  const related = relatedProducts(product);
  const isDemo = product.id === DEMO_REFRIGERATOR.slug;
  const [catalogueStatus, setCatalogueStatus] = useState<"loading" | "unpublished" | "published" | "error">("loading");
  const [publishedProduct, setPublishedProduct] = useState<PublicSupabaseProduct | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCatalogueStatus("loading");
    setPublishedProduct(null);
    getPublishedProductBySlug(product.id)
      .then((record) => {
        if (!cancelled) {
          setPublishedProduct(record);
          setCatalogueStatus(record ? "published" : "unpublished");
        }
      })
      .catch(() => { if (!cancelled) setCatalogueStatus("error"); });
    return () => { cancelled = true; };
  }, [product.id]);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = frame.current?.getBoundingClientRect();
    if (!rect) return;
    setZoom({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  };

  if (catalogueStatus !== "published" || !publishedProduct) {
    const message = catalogueStatus === "loading" ? "Checking product availability…" :
      catalogueStatus === "error" ? "Product information is temporarily unavailable. Please try again later." :
      "This product is not currently published.";
    return <main className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
      <h1 className="text-3xl font-semibold">Product unavailable</h1>
      <p role="status" className="mt-4 text-muted-foreground">{message}</p>
      <Link to="/" className="mt-6 inline-block text-primary">Return to OddGrid</Link>
    </main>;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <nav className="text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          Home
        </Link>
        <span className="px-2">/</span>
        <Link to={`/${product.category}`} className="hover:text-foreground">
          {
            {
              "sub-zero": "Sub-zero",
              "solar-hvac": "Solar HVAC",
              "back-up-power": "Back-up power",
              "hybrid-inverters": "Hybrid Inverters",
            }[product.category]
          }
        </Link>
        <span className="px-2">/</span>
        <span className="text-foreground">{product.name}</span>
      </nav>

      <div className="mt-8 grid gap-10 lg:grid-cols-2">
        <div>
          <div
            ref={frame}
            onMouseMove={onMove}
            onMouseLeave={() => setZoom(null)}
            className="glass relative aspect-4/3 overflow-hidden rounded-3xl bg-surface-2"
          >
            <img
              src={images[index]}
              alt={product.name}
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
            <span className="glass pointer-events-none absolute right-4 bottom-4 rounded-full px-3 py-1 text-xs text-muted-foreground">
              Hover to zoom
            </span>
          </div>
          <div className="mt-4 flex gap-3">
            {images.map((img, i) => (
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
                  src={img}
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
            {product.subcategory}
          </p>
          <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">{publishedProduct.name}</h1>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <span className="text-3xl font-semibold">
              {publishedProduct.sale_type === "rfq" ? "Price on request" : displaySellingPrice(publishedProduct) ?? "Price on request"}
            </span>
            {publishedProduct.sku && <span className="text-xs text-muted-foreground">SKU {publishedProduct.sku}</span>}
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            Contact OddGrid for confirmed specifications and availability. Online checkout is not yet enabled.
          </p>
        </div>
      </div>

      {false && related.length > 0 && (
        <section className="mt-20">
          <h2 className="text-2xl font-semibold sm:text-3xl">Related products</h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((p, i) => (
              <Reveal key={p.id} delay={i * 0.06}>
                <ProductCard product={p} />
              </Reveal>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

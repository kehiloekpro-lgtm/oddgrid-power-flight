import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Download, FileText, MessageCircle, Plus, Check } from "lucide-react";
import { useRef, useState } from "react";
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
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/products/$productId")({
  loader: ({ params }) => {
    const product = getProduct(params.productId);
    if (!product) throw notFound();
    return { product };
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Product unavailable — OddGrid" }, { name: "robots", content: "noindex" }],
      };
    }
    const { product } = loaderData;
    return {
      meta: [
        { title: `${product.name} — OddGrid` },
        { name: "description", content: product.description.slice(0, 155) },
        { property: "og:title", content: `${product.name} — OddGrid` },
        { property: "og:description", content: product.description.slice(0, 155) },
        { property: "og:type", content: "product" },
        { property: "og:url", content: `/products/${params.productId}` },
      ],
      links: [{ rel: "canonical", href: `/products/${params.productId}` }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: product.name,
            brand: product.brand,
            sku: product.sku,
            description: product.description,
            offers: {
              "@type": "Offer",
              price: product.price,
              priceCurrency: "USD",
              availability:
                product.stock > 0
                  ? "https://schema.org/InStock"
                  : "https://schema.org/OutOfStock",
            },
          }),
        },
      ],
    };
  },
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

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = frame.current?.getBoundingClientRect();
    if (!rect) return;
    setZoom({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  };

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
            {product.brand} · {product.subcategory}
          </p>
          <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">{product.name}</h1>
          <p className="mt-4 text-muted-foreground">{product.description}</p>

          <div className="mt-6 flex flex-wrap items-center gap-4">
            <span className="text-3xl font-semibold">{formatPrice(product.price)}</span>
            <span
              className={cn(
                "rounded-full border px-3 py-1 text-xs",
                stock.tone === "in" && "border-success/40 bg-success/15 text-success",
                stock.tone === "low" && "border-accent/40 bg-accent/15 text-accent",
                stock.tone === "out" && "border-destructive/40 bg-destructive/15 text-destructive",
              )}
            >
              {stock.label}
            </span>
            <span className="text-xs text-muted-foreground">SKU {product.sku}</span>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button
              size="lg"
              onClick={() => {
                add(product.id, product.name);
                toast.success(`${product.name} added to your quote`);
              }}
            >
              <Plus className="size-4" /> Request quote
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href={WHATSAPP_URL} target="_blank" rel="noreferrer">
                <MessageCircle className="size-4" /> WhatsApp us
              </a>
            </Button>
          </div>

          <ul className="mt-8 grid gap-2">
            {product.features.map((f) => (
              <li key={f} className="flex gap-3 text-sm text-muted-foreground">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                {f}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <Tabs defaultValue="specs" className="mt-16">
        <TabsList>
          <TabsTrigger value="specs">Specifications</TabsTrigger>
          <TabsTrigger value="description">Description</TabsTrigger>
          <TabsTrigger value="downloads">Downloads</TabsTrigger>
        </TabsList>
        <TabsContent value="specs" className="glass mt-6 rounded-3xl p-6">
          <dl className="grid gap-x-10 gap-y-4 sm:grid-cols-2">
            {Object.entries(product.specifications).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-6 border-b border-border pb-3">
                <dt className="text-sm text-muted-foreground">{k}</dt>
                <dd className="text-right text-sm font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </TabsContent>
        <TabsContent value="description" className="glass mt-6 rounded-3xl p-6">
          <p className="text-muted-foreground">{product.description}</p>
          <p className="mt-4 text-muted-foreground">
            Every unit we list is supported by OddGrid technical staff, ships with the full
            manufacturer warranty and can be bundled into a larger system on request.
          </p>
        </TabsContent>
        <TabsContent value="downloads" className="glass mt-6 rounded-3xl p-6">
          <ul className="grid gap-3 sm:grid-cols-2">
            {["Datasheet (PDF)", "User manual (PDF)", "Quick start guide", "Warranty terms"].map(
              (d) => (
                <li key={d}>
                  <a
                    href={WHATSAPP_URL}
                    className="flex items-center gap-3 rounded-2xl border border-border px-4 py-3 text-sm transition-colors hover:border-primary/50"
                  >
                    <FileText className="size-4 text-primary" />
                    <span className="flex-1">{d}</span>
                    <Download className="size-4 text-muted-foreground" />
                  </a>
                </li>
              ),
            )}
          </ul>
        </TabsContent>
      </Tabs>

      {related.length > 0 && (
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

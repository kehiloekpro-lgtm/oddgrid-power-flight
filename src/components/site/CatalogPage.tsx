import { useEffect, useMemo, useState } from "react";

import { Link } from "@tanstack/react-router";
import { productImages, type Product } from "@/lib/products";
import { displaySellingPrice, listPublishedProducts, type PublicSupabaseProduct } from "@/lib/supabase-products";
import { Reveal } from "@/components/site/Reveal";
import { byCategory, type ProductCategory } from "@/lib/products";
import { cn } from "@/lib/utils";

export function CatalogPage({
  category,
  title,
  intro,
  filters,
  image,
}: {
  category: ProductCategory;
  title: string;
  intro: string;
  filters: string[];
  image: string;
}) {
  const [active, setActive] = useState<string>("All");
  const localProducts = useMemo(() => byCategory(category), [category]);
  const [published, setPublished] = useState<PublicSupabaseProduct[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    listPublishedProducts()
      .then((rows) => {
        if (!cancelled) {
          setPublished(rows);
          setLoadState("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setLoadState("error");
      });
    return () => { cancelled = true; };
  }, []);

  // Existing local entries provide imagery and category layout ONLY.
  // Supabase alone determines whether a product appears and what price it has.
  const shown = localProducts
    .filter((local) => active === "All" || local.subcategory === active)
    .map((local) => ({
      local,
      record: published.find((row) => row.slug === local.id),
    }))
    .filter((entry): entry is { local: Product; record: PublicSupabaseProduct } => !!entry.record);

  return (
    <>
      <section className="relative isolate overflow-hidden border-b border-border">
        <img
          src={image}
          alt={title}
          width={1200}
          height={900}
          className="absolute inset-0 -z-20 h-full w-full object-cover opacity-40"
        />
        <div className="absolute inset-0 -z-10 bg-linear-to-r from-background via-background/80 to-background/40" />
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
          <h1 className="max-w-3xl text-4xl font-semibold sm:text-5xl">{title}</h1>
          <p className="mt-4 max-w-2xl text-muted-foreground">{intro}</p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="flex flex-wrap gap-2">
          {["All", ...filters].map((f) => (
            <button
              key={f}
              onClick={() => setActive(f)}
              className={cn(
                "rounded-full border px-4 py-2 text-sm transition-colors",
                active === f
                  ? "border-primary/50 bg-primary/15 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map(({ local, record }, i) => (
            <Reveal key={record.id} delay={Math.min(i, 5) * 0.05}>
              <article className="glass card-hover group flex flex-col overflow-hidden rounded-3xl">
                <Link to="/products/$productId" params={{ productId: local.id }} className="relative block aspect-4/3 overflow-hidden bg-surface-2">
                  <img src={productImages(local)[0]} alt={record.name} loading="lazy" width={1200} height={900}
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                </Link>
                <div className="flex flex-1 flex-col gap-3 p-5">
                  <span className="text-xs tracking-[0.2em] text-muted-foreground uppercase">{local.subcategory}</span>
                  <h3 className="text-lg leading-snug font-semibold">{record.name}</h3>
                  <p className="mt-auto pt-2 text-xl font-semibold">
                    {record.sale_type === "rfq" ? "Request a quote" : displaySellingPrice(record) ?? "Price on request"}
                  </p>
                  <Link to="/products/$productId" params={{ productId: local.id }}
                    className="rounded-xl border border-border px-4 py-2 text-center text-sm hover:border-primary/50">
                    View details
                  </Link>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
        {loadState === "loading" && <p role="status" className="py-20 text-center text-muted-foreground">Loading catalogue…</p>}
        {loadState === "error" && <p role="alert" className="py-20 text-center text-muted-foreground">Catalogue temporarily unavailable. Please try again later.</p>}
        {loadState === "ready" && shown.length === 0 && (
          <p className="py-20 text-center text-muted-foreground">No published products in this category yet.</p>
        )}
      </section>
    </>
  );
}

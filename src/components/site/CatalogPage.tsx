import { useMemo, useState } from "react";

import { ProductCard } from "@/components/site/ProductCard";
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
  const all = useMemo(() => byCategory(category), [category]);
  const shown = active === "All" ? all : all.filter((p) => p.subcategory === active);

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
          {shown.map((p, i) => (
            <Reveal key={p.id} delay={Math.min(i, 5) * 0.05}>
              <ProductCard product={p} />
            </Reveal>
          ))}
        </div>
        {shown.length === 0 && (
          <p className="py-20 text-center text-muted-foreground">
            No products listed in this range yet — request a quote and we will source it.
          </p>
        )}
      </section>
    </>
  );
}

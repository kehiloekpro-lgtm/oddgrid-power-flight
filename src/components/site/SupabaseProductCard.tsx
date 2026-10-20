import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Package } from "lucide-react";
import type { FeaturedProduct } from "@/lib/featured-products";

export function SupabaseProductCard({ item }: { item: FeaturedProduct }) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const { product } = item;
  return (
    <article className="glass card-hover group flex h-full flex-col overflow-hidden rounded-3xl">
      <Link
        to="/products/$productId"
        params={{ productId: product.slug }}
        className="relative block aspect-4/3 overflow-hidden bg-surface-2"
        aria-label={`View ${product.name}`}
      >
        {item.image && failedImage !== item.image ? (
          <img
            src={item.image}
            alt={item.imageAlt}
            loading="lazy"
            width={1200}
            height={900}
            onError={() => setFailedImage(item.image)}
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <Package className="size-12" aria-hidden="true" />
            <span className="text-sm">Product photograph coming soon</span>
          </div>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <span className="text-xs tracking-[0.2em] text-muted-foreground uppercase">
          {item.categoryName}
        </span>
        <h3 className="text-lg leading-snug font-semibold">{product.name}</h3>
        <p className="mt-auto pt-2 text-xl font-semibold">{item.price}</p>
        <Link
          to="/products/$productId"
          params={{ productId: product.slug }}
          className="rounded-xl border border-border px-4 py-2 text-center text-sm hover:border-primary/50"
        >
          View details
        </Link>
      </div>
    </article>
  );
}

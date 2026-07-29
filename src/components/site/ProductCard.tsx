import { Link } from "@tanstack/react-router";
import { ArrowRight, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { formatPrice, productImages, stockLabel, type Product } from "@/lib/products";
import { useQuote } from "@/lib/quote-store";
import { cn } from "@/lib/utils";

export function ProductCard({ product }: { product: Product }) {
  const [image] = productImages(product);
  const stock = stockLabel(product.stock);
  const { add } = useQuote();

  return (
    <article className="glass card-hover group flex flex-col overflow-hidden rounded-3xl">
      <Link
        to="/products/$productId"
        params={{ productId: product.id }}
        className="relative block aspect-4/3 overflow-hidden bg-surface-2"
      >
        <img
          src={image}
          alt={product.name}
          loading="lazy"
          width={1200}
          height={900}
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
        <span
          className={cn(
            "absolute top-4 left-4 rounded-full border px-3 py-1 text-xs font-medium backdrop-blur-md",
            stock.tone === "in" && "border-success/40 bg-success/15 text-success",
            stock.tone === "low" && "border-accent/40 bg-accent/15 text-accent",
            stock.tone === "out" && "border-destructive/40 bg-destructive/15 text-destructive",
          )}
        >
          {stock.label}
        </span>
      </Link>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs tracking-[0.2em] text-muted-foreground uppercase">
            {product.brand}
          </span>
          <span className="text-xs text-muted-foreground">{product.subcategory}</span>
        </div>
        <h3 className="text-lg leading-snug font-semibold">{product.name}</h3>
        <p className="line-clamp-2 text-sm text-muted-foreground">{product.description}</p>
        <p className="mt-auto pt-2 text-xl font-semibold">{formatPrice(product.price)}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button asChild size="sm" className="flex-1">
            <Link to="/products/$productId" params={{ productId: product.id }}>
              View details <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={() => {
              add(product.id, product.name);
              toast.success(`${product.name} added to your quote`);
            }}
          >
            <Plus className="size-4" /> Add to quote
          </Button>
        </div>
      </div>
    </article>
  );
}

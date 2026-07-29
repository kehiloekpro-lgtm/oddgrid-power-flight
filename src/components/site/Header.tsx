import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, Search, ShoppingCart, X, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { products, formatPrice } from "@/lib/products";
import { useQuote } from "@/lib/quote-store";
import { cn } from "@/lib/utils";

const nav = [
  { label: "Home", to: "/" },
  { label: "Power Solutions", to: "/power-solutions" },
  { label: "Drones", to: "/drones" },
  { label: "Brands", to: "/brands" },
  { label: "About", to: "/about" },
  { label: "Contact", to: "/contact" },
] as const;

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { count } = useQuote();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 6);
    return products
      .filter((p) =>
        [p.name, p.brand, p.subcategory, p.description].join(" ").toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [query]);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled ? "glass-strong py-2" : "py-4",
      )}
    >
      <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 sm:px-6">
        <Link to="/" className="flex min-w-0 items-center gap-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/30">
            <Zap className="size-5" />
          </span>
          <span className="truncate text-lg font-semibold tracking-tight">OddGrid</span>
        </Link>

        <nav className="col-span-2 hidden items-center gap-1 lg:col-span-1 lg:flex lg:justify-center">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.to === "/" }}
              className="rounded-full px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground data-[status=active]:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Search products">
                <Search className="size-5" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>Search the catalogue</DialogTitle>
              </DialogHeader>
              <Input
                autoFocus
                placeholder="Try “fishing drone” or “solar panel”"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <ul className="max-h-80 space-y-1 overflow-y-auto">
                {results.map((p) => (
                  <li key={p.id}>
                    <Link
                      to="/products/$productId"
                      params={{ productId: p.id }}
                      onClick={() => setSearchOpen(false)}
                      className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-secondary"
                    >
                      <span className="min-w-0 truncate">{p.name}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {formatPrice(p.price)}
                      </span>
                    </Link>
                  </li>
                ))}
                {results.length === 0 && (
                  <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                    No products matched that search.
                  </li>
                )}
              </ul>
            </DialogContent>
          </Dialog>

          <Button asChild variant="ghost" size="icon" className="relative" aria-label="Quote list">
            <Link to="/quote">
              <ShoppingCart className="size-5" />
              {count > 0 && (
                <span className="absolute -top-0.5 -right-0.5 grid size-4.5 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                  {count}
                </span>
              )}
            </Link>
          </Button>

          <Button asChild className="hidden sm:inline-flex">
            <Link to="/quote">Request Quote</Link>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Toggle menu"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </div>

      {open && (
        <nav className="glass-strong mt-2 grid gap-1 px-4 py-4 lg:hidden">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground data-[status=active]:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}

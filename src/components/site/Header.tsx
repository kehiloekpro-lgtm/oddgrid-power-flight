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
import { listPublishedProducts, displaySellingPrice, type PublicSupabaseProduct } from "@/lib/supabase-products";
import { useGuestCart } from "@/hooks/use-guest-cart";
import { cn } from "@/lib/utils";


const nav = [
  { label: "Home", to: "/" },
  { label: "Sub-zero", to: "/sub-zero" },
  { label: "Solar HVAC", to: "/solar-hvac" },
  { label: "Back-up power", to: "/back-up-power" },
  { label: "Hybrid Inverters", to: "/hybrid-inverters" },
  { label: "About", to: "/about" },
  { label: "Contact", to: "/contact" },
] as const;

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [published, setPublished] = useState<PublicSupabaseProduct[]>([]);
  const [searchStatus, setSearchStatus] = useState<"loading" | "ready" | "error">("loading");
  const { count } = useGuestCart();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    let cancelled = false;
    setSearchStatus("loading");
    listPublishedProducts()
      .then((rows) => { if (!cancelled) { setPublished(rows); setSearchStatus("ready"); } })
      .catch(() => { if (!cancelled) { setPublished([]); setSearchStatus("error"); } });
    return () => { cancelled = true; };
  }, [searchOpen]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return published.slice(0, 6);
    return published
      .filter((p) =>
        [p.name, p.sku ?? "", p.slug].join(" ").toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [query, published]);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled ? "glass-strong py-2" : "py-4",
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" className="flex min-w-0 items-center gap-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/30">
            <Zap className="size-5" />
          </span>
          <span className="truncate text-lg font-semibold tracking-tight">OddGrid</span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
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
                      params={{ productId: p.slug }}
                      onClick={() => setSearchOpen(false)}
                      className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-secondary"
                    >
                      <span className="min-w-0 truncate">{p.name}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {p.sale_type === "rfq" ? "Request a quote" : displaySellingPrice(p) ?? "Price on request"}
                      </span>
                    </Link>
                  </li>
                ))}
                {searchStatus === "loading" && <li role="status" className="px-3 py-6 text-center text-sm text-muted-foreground">Loading catalogue…</li>}
                {searchStatus === "error" && <li role="alert" className="px-3 py-6 text-center text-sm text-muted-foreground">Search is temporarily unavailable.</li>}
                {searchStatus === "ready" && results.length === 0 && (
                  <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                    No products matched that search.
                  </li>
                )}
              </ul>
            </DialogContent>
          </Dialog>

          <Button asChild variant="ghost" size="icon" className="relative" aria-label="Shopping cart">
            <Link to="/cart">
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

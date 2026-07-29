import { createFileRoute, Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/site/ProductCard";
import { Reveal } from "@/components/site/Reveal";
import { products } from "@/lib/products";

export const Route = createFileRoute("/brands")({
  head: () => ({
    meta: [
      { title: "Brands — SwellPro, FIMI & Partners | OddGrid" },
      {
        name: "description",
        content:
          "The manufacturers behind OddGrid: SwellPro waterproof drones, FIMI camera and mapping platforms, and future partner brands.",
      },
      { property: "og:title", content: "Brands — SwellPro, FIMI & Partners | OddGrid" },
      {
        property: "og:description",
        content: "Vetted manufacturers with proven field records, distributed by OddGrid.",
      },
      { property: "og:url", content: "/brands" },
    ],
    links: [{ rel: "canonical", href: "/brands" }],
  }),
  component: BrandsPage,
});

const brands = [
  {
    name: "SwellPro",
    tagline: "The waterproof drone pioneer",
    history:
      "Founded in 2013, SwellPro built the world's first fully waterproof consumer multirotor and has spent a decade refining sealed airframes for anglers, lifeguards and marine operators.",
    tech: [
      "IP67 sealed airframes that float and take off from water",
      "Modular payload bays for cameras, releases and rescue gear",
      "Corrosion-resistant motors rated for saltwater",
    ],
  },
  {
    name: "FIMI",
    tagline: "Precision aerial imaging",
    history:
      "A Xiaomi-ecosystem company, FIMI has shipped millions of compact camera drones and now builds RTK-grade mapping platforms and fixed-wing VTOL aircraft for survey work.",
    tech: [
      "3-axis mechanical gimbals with HDR imaging pipelines",
      "Long-range transmission up to 15 km",
      "RTK-ready positioning for photogrammetry",
    ],
  },
  {
    name: "Future Partner Brands",
    tagline: "Onboarding now",
    history:
      "OddGrid is actively evaluating manufacturers in portable energy storage, hybrid inverters and specialised UAV payloads. Distribution enquiries are welcome.",
    tech: [
      "Regional distribution and warehousing",
      "Technical enablement and installer training",
      "Localised marketing and product content",
    ],
  },
];

function BrandsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
      <h1 className="max-w-3xl text-4xl font-semibold sm:text-5xl">
        The manufacturers behind the catalogue
      </h1>
      <p className="mt-4 max-w-2xl text-muted-foreground">
        We partner with a small number of manufacturers and go deep — stock, spares, training and
        technical support for everything we list.
      </p>

      <div className="mt-14 space-y-16">
        {brands.map((brand, i) => {
          const featured = products.filter((p) => p.brand === brand.name).slice(0, 3);
          return (
            <Reveal key={brand.name} delay={i * 0.05}>
              <section className="glass rounded-4xl p-6 sm:p-10">
                <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr]">
                  <div>
                    <div className="grid h-28 place-items-center rounded-3xl border border-border bg-surface-2">
                      <span className="text-2xl font-semibold tracking-[0.2em] uppercase">
                        {brand.name}
                      </span>
                    </div>
                    <p className="mt-4 text-sm text-primary">{brand.tagline}</p>
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold">History</h2>
                    <p className="mt-2 text-sm text-muted-foreground">{brand.history}</p>
                    <h3 className="mt-6 text-xl font-semibold">Technology highlights</h3>
                    <ul className="mt-2 space-y-2">
                      {brand.tech.map((t) => (
                        <li key={t} className="text-sm text-muted-foreground">
                          — {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {featured.length > 0 ? (
                  <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {featured.map((p) => (
                      <ProductCard key={p.id} product={p} />
                    ))}
                  </div>
                ) : (
                  <div className="mt-10">
                    <Button asChild variant="outline">
                      <Link to="/contact">Become a partner brand</Link>
                    </Button>
                  </div>
                )}
              </section>
            </Reveal>
          );
        })}
      </div>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Snowflake,
  Wind,
  Headphones,
  ShieldCheck,
  Sparkles,
  Truck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/site/ProductCard";
import { Reveal } from "@/components/site/Reveal";
import { backupPowerCategories, byCategory, solarHvacCategories, subZeroCategories } from "@/lib/products";
import heroImg from "@/assets/hero-solar-cooling.jpg";
import catPower from "@/assets/cat-refrigeration.jpg";
import catDrones from "@/assets/cat-solar-hvac.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OddGrid — Solar Refrigeration & Portable Cooling" },
      {
        name: "description",
        content:
          "Solar refrigerators, freezers, portable coolers and solar air-cons, backed by portable power stations.",
      },
      { property: "og:title", content: "OddGrid — Solar Refrigeration & Portable Cooling" },
      {
        property: "og:description",
        content: "Solar cooling that keeps running when the grid does not.",
      },
      { property: "og:url", content: "/" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
  component: Index,
});

const why = [
  { icon: Truck, title: "Fast Delivery", copy: "Stocked locally and dispatched within 24 hours." },
  {
    icon: Sparkles,
    title: "Premium Brands",
    copy: "Only vetted manufacturers with proven field records.",
  },
  {
    icon: Headphones,
    title: "Technical Support",
    copy: "Specialists who size and install what they sell.",
  },
  { icon: ShieldCheck, title: "Warranty", copy: "Full manufacturer warranty with local backing." },
];

function Index() {
  const cooling = byCategory("sub-zero").slice(0, 4);
  const power = byCategory("back-up-power").slice(0, 4);

  return (
    <>
      <section className="relative isolate overflow-hidden">
        <img
          src={heroImg}
          alt="Solar refrigerator and portable cooler in a dark studio"
          width={1920}
          height={1088}
          className="absolute inset-0 -z-20 h-full w-full object-cover"
        />
        <div className="absolute inset-0 -z-10 bg-linear-to-r from-background via-background/70 to-background/10" />
        <div className="mx-auto flex min-h-[86vh] max-w-7xl flex-col justify-center px-4 py-28 sm:px-6">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="glass w-fit rounded-full px-4 py-1.5 text-xs tracking-[0.25em] uppercase"
          >
            Cold · Cool · Off-grid
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="mt-6 max-w-4xl text-4xl leading-[1.05] font-semibold sm:text-6xl lg:text-7xl"
          >
            Keep It Cold.
            <br />
            <span className="text-gradient">Powered by the Sun.</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.18 }}
            className="mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg"
          >
            Solar refrigerators, freezers, portable coolers and solar air-cons for homes,
            businesses, farms and adventurers.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.28 }}
            className="mt-10 flex flex-wrap gap-3"
          >
            <Button asChild size="lg">
              <Link to="/sub-zero">
                Shop Portable Refrigeration & Cooling <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/solar-hvac">Shop Portable Solar-powered Air-cons</Link>
            </Button>
          </motion.div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <Reveal>
          <h2 className="text-3xl font-semibold sm:text-4xl">Solar cooling. Zero compromise.</h2>
        </Reveal>
        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <CategoryCard
            to="/sub-zero"
            image={catPower}
            icon={Snowflake}
            title="Sub-zero"
            items={subZeroCategories}
          />
          <CategoryCard
            to="/solar-hvac"
            image={catDrones}
            icon={Wind}
            title="Solar HVAC"
            items={solarHvacCategories}
            delay={0.1}
          />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <Reveal>
          <h2 className="text-3xl font-semibold sm:text-4xl">Why choose OddGrid</h2>
        </Reveal>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {why.map((item, i) => (
            <Reveal key={item.title} delay={i * 0.08}>
              <div className="glass card-hover h-full rounded-3xl p-6">
                <span className="grid size-11 place-items-center rounded-2xl bg-primary/15 text-primary ring-1 ring-primary/25">
                  <item.icon className="size-5" />
                </span>
                <h3 className="mt-5 text-lg font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{item.copy}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <FeaturedGrid
        title="Featured refrigeration"
        subtitle="Solar fridges, freezers and coolers built for off-grid cold."
        to="/sub-zero"
        products={cooling}
      />
      <FeaturedGrid
        title="Supporting power"
        subtitle="Portable power stations to back up your cooling."
        to="/back-up-power"
        products={power}
      />

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <Reveal>
          <div className="glass relative overflow-hidden rounded-4xl px-6 py-14 text-center sm:px-16">
            <div className="bg-hero absolute inset-0 -z-10 opacity-80" />
            <h2 className="text-3xl font-semibold sm:text-4xl">
              Building something that needs to stay cold off-grid?
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
              Send us your requirement and our specialists will spec the system, quote it and
              support it.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg">
                <Link to="/quote">Request a quote</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/contact">Talk to a specialist</Link>
              </Button>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
}

function CategoryCard({
  to,
  image,
  icon: Icon,
  title,
  items,
  delay = 0,
}: {
  to: string;
  image: string;
  icon: typeof Snowflake;
  title: string;
  items: string[];
  delay?: number;
}) {
  return (
    <Reveal delay={delay}>
      <Link to={to} className="group glass card-hover block h-full overflow-hidden rounded-4xl">
        <div className="relative aspect-16/10 overflow-hidden">
          <img
            src={image}
            alt={title}
            loading="lazy"
            width={1200}
            height={900}
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-linear-to-t from-background via-background/40 to-transparent" />
          <div className="absolute bottom-5 left-6 flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-2xl bg-primary/20 text-primary ring-1 ring-primary/30">
              <Icon className="size-5" />
            </span>
            <h3 className="text-2xl font-semibold">{title}</h3>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 p-6">
          {items.map((i) => (
            <span
              key={i}
              className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground"
            >
              {i}
            </span>
          ))}
        </div>
      </Link>
    </Reveal>
  );
}

function FeaturedGrid({
  title,
  subtitle,
  to,
  products,
}: {
  title: string;
  subtitle: string;
  to: string;
  products: ReturnType<typeof byCategory>;
}) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <Reveal>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
          <div className="min-w-0">
            <h2 className="text-3xl font-semibold sm:text-4xl">{title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
          </div>
          <Button asChild variant="ghost" className="shrink-0">
            <Link to={to}>
              View all <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </Reveal>
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {products.map((p, i) => (
          <Reveal key={p.id} delay={i * 0.06}>
            <ProductCard product={p} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}

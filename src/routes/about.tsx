import { createFileRoute, Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/site/Reveal";
import heroImg from "@/assets/hero.jpg";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About OddGrid — Freedom, Performance, Independence" },
      {
        name: "description",
        content:
          "OddGrid supplies premium backup power and professional drone technology, backed by specialists who install and fly what they sell.",
      },
      { property: "og:title", content: "About OddGrid" },
      {
        property: "og:description",
        content: "Premium technology that gives customers freedom, performance and independence.",
      },
      { property: "og:url", content: "/about" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/about" }],
  }),
  component: AboutPage,
});

const stats = [
  { value: "2", label: "Flagship categories" },
  { value: "24h", label: "Dispatch on stocked items" },
  { value: "10+", label: "Years of partner engineering" },
  { value: "100%", label: "Warranty-backed" },
];

function AboutPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
      <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
        <div>
          <h1 className="text-4xl font-semibold sm:text-5xl">
            Technology that makes people <span className="text-gradient">independent</span>.
          </h1>
          <p className="mt-6 text-muted-foreground">
            OddGrid exists for the moments the grid fails and the places the road ends. We curate
            two categories — backup power and unmanned aircraft — and we go deep on both, so the
            people who rely on this equipment never have to guess whether it will perform.
          </p>
          <p className="mt-4 text-muted-foreground">
            Everything we list is selected for build quality, serviceability and honest
            specification. We stock spares, we train installers and operators, and we answer the
            phone after the sale.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/quote">Request a quote</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/brands">Meet our brands</Link>
            </Button>
          </div>
        </div>
        <Reveal>
          <img
            src={heroImg}
            alt="OddGrid power station and drone"
            loading="lazy"
            width={1920}
            height={1088}
            className="shadow-card w-full rounded-4xl object-cover"
          />
        </Reveal>
      </div>

      <div className="mt-20 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s, i) => (
          <Reveal key={s.label} delay={i * 0.06}>
            <div className="glass rounded-3xl p-6 text-center">
              <p className="text-3xl font-semibold text-gradient">{s.value}</p>
              <p className="mt-2 text-sm text-muted-foreground">{s.label}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  );
}

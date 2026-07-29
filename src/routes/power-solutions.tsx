import { createFileRoute } from "@tanstack/react-router";

import { CatalogPage } from "@/components/site/CatalogPage";
import { powerCategories } from "@/lib/products";
import catPower from "@/assets/cat-power.jpg";

export const Route = createFileRoute("/power-solutions")({
  head: () => ({
    meta: [
      { title: "Backup Power Solutions — OddGrid" },
      {
        name: "description",
        content:
          "Portable power stations, solar panels, inverters, LiFePO4 battery systems, MPPT controllers and UPS units from OddGrid.",
      },
      { property: "og:title", content: "Backup Power Solutions — OddGrid" },
      {
        property: "og:description",
        content: "Silent lithium energy for homes, work sites and expeditions.",
      },
      { property: "og:url", content: "/power-solutions" },
    ],
    links: [{ rel: "canonical", href: "/power-solutions" }],
  }),
  component: PowerPage,
});

function PowerPage() {
  return (
    <CatalogPage
      category="power"
      title="Backup Power Solutions"
      intro="Silent, fume-free lithium energy engineered for load shedding, off-grid living, mobile production and critical uptime."
      filters={powerCategories}
      image={catPower}
    />
  );
}

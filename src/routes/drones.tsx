import { createFileRoute } from "@tanstack/react-router";

import { CatalogPage } from "@/components/site/CatalogPage";
import { droneCategories } from "@/lib/products";
import catDrones from "@/assets/cat-drones.jpg";

export const Route = createFileRoute("/drones")({
  head: () => ({
    meta: [
      { title: "Professional & Recreational Drones — OddGrid" },
      {
        name: "description",
        content:
          "Camera, waterproof, mapping, agricultural and fishing drones from SwellPro and FIMI, plus batteries and propellers.",
      },
      { property: "og:title", content: "Professional & Recreational Drones — OddGrid" },
      {
        property: "og:description",
        content: "SwellPro and FIMI flight platforms for creators, surveyors, farmers and anglers.",
      },
      { property: "og:url", content: "/drones" },
    ],
    links: [{ rel: "canonical", href: "/drones" }],
  }),
  component: DronesPage,
});

function DronesPage() {
  return (
    <CatalogPage
      category="drones"
      title="Professional & Recreational Drones"
      intro="Flight platforms built for saltwater, farmland, survey corridors and cinematic work — from pocket-sized to fixed-wing VTOL."
      filters={droneCategories}
      image={catDrones}
    />
  );
}

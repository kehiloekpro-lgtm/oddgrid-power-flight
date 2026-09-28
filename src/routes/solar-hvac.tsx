import { createFileRoute } from "@tanstack/react-router";

import { CatalogPage } from "@/components/site/CatalogPage";
import catSolarHvac from "@/assets/cat-solar-hvac.jpg";
import { solarHvacCategories } from "@/lib/products";

export const Route = createFileRoute("/solar-hvac")({
  head: () => ({ meta: [
    { title: "Portable Solar-Powered Air Conditioners — OddGrid" },
    { name: "description", content: "Shop compact solar-ready air conditioners for tents, cabins, site offices and mobile spaces." },
    { property: "og:title", content: "Portable Solar HVAC — OddGrid" },
    { property: "og:description", content: "Efficient portable cooling for spaces beyond the grid." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: SolarHvacPage,
});
function SolarHvacPage() { return <CatalogPage category="solar-hvac" title="Portable solar-powered air-cons" intro="Targeted, energy-efficient cooling for tents, cabins, workspaces and mobile operations." filters={solarHvacCategories} image={catSolarHvac} />; }

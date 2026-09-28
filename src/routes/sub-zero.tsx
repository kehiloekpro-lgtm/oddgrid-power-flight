import { createFileRoute } from "@tanstack/react-router";

import { CatalogPage } from "@/components/site/CatalogPage";
import catRefrigeration from "@/assets/cat-refrigeration.jpg";
import { subZeroCategories } from "@/lib/products";

export const Route = createFileRoute("/sub-zero")({
  head: () => ({ meta: [
    { title: "Solar Refrigerators, Freezers & Coolers — OddGrid" },
    { name: "description", content: "Shop efficient solar refrigerators, solar freezers and portable solar coolers for homes, businesses and off-grid use." },
    { property: "og:title", content: "Sub-zero Solar Refrigeration — OddGrid" },
    { property: "og:description", content: "Reliable cold storage powered by the sun, from upright refrigerators to expedition coolers." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: SubZeroPage,
});
function SubZeroPage() { return <CatalogPage category="sub-zero" title="Sub-zero solar refrigeration" intro="Efficient cold storage that keeps food, medicine and drinks protected wherever the grid stops." filters={subZeroCategories} image={catRefrigeration} />; }

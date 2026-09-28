import { createFileRoute } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CatalogPage } from "@/components/site/CatalogPage";
import catBackupPower from "@/assets/cat-backup-power.jpg";
import { hybridInverterCategories, WHATSAPP_URL } from "@/lib/products";

export const Route = createFileRoute("/hybrid-inverters")({
  head: () => ({ meta: [
    { title: "Hybrid Solar Inverters — Request a Quote | OddGrid" },
    { name: "description", content: "Request a tailored quote for a hybrid inverter matched to your solar array, batteries and essential loads." },
    { property: "og:title", content: "Hybrid Inverters — OddGrid" },
    { property: "og:description", content: "System-matched hybrid inverter specification and pricing by request." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: HybridInvertersPage,
});
function HybridInvertersPage() { return <><CatalogPage category="hybrid-inverters" title="Hybrid inverters" intro="Configured to your property, solar array, battery bank and essential loads. Every inverter is supplied by request for quote." filters={hybridInverterCategories} image={catBackupPower} /><section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6"><div className="glass flex flex-col items-start justify-between gap-6 rounded-3xl p-6 sm:flex-row sm:items-center sm:p-8"><div><h2 className="text-2xl font-semibold">Need help sizing your inverter?</h2><p className="mt-2 text-sm text-muted-foreground">Send your appliance list or latest electricity bill and we’ll build the right specification.</p></div><Button asChild size="lg"><a href={WHATSAPP_URL} target="_blank" rel="noreferrer"><MessageCircle className="size-4" /> Start an RFQ</a></Button></div></section></>; }

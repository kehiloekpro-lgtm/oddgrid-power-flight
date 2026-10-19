import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, Snowflake } from "lucide-react";

export const Route = createFileRoute("/solar-refrigeration-interest")({
  head: () => ({ meta: [
    { title: "Solar Refrigeration Research — OddGrid" },
    { name: "description", content: "Explore upright solar refrigerators and chest refrigerators/freezers. OddGrid is evaluating suppliers for US customers; products are not yet available for purchase." },
    { name: "robots", content: "noindex, nofollow" },
  ] }),
  component: SolarRefrigerationInterest,
});

function SolarRefrigerationInterest() {
  return <main className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
      PRE-LAUNCH RESEARCH — OddGrid has not confirmed suppliers, US delivery, pricing or product availability. No orders, reservations or payments are being accepted.
    </div>
    <div className="mt-14 max-w-3xl">
      <span className="inline-flex items-center gap-2 text-sm font-medium text-primary"><Snowflake className="size-4" /> Solar refrigeration</span>
      <h1 className="mt-5 text-4xl font-semibold leading-tight sm:text-6xl">Reliable cold storage, beyond the grid.</h1>
      <p className="mt-6 text-lg text-muted-foreground">OddGrid is researching solar-compatible refrigerators and freezers for off-grid properties across the United States. Explore the two formats we're evaluating before supplier-approved products become available.</p>
    </div>
    <div className="mt-12 grid gap-5 md:grid-cols-2">
      <section className="glass rounded-3xl p-7">
        <h2 className="text-2xl font-semibold">Upright solar refrigerators</h2>
        <p className="mt-3 text-muted-foreground">A familiar, easy-access format for cabins, homesteads and off-grid kitchens. Actual energy use, electrical requirements and capacity depend on the manufacturer and model.</p>
        <p className="mt-6 text-sm text-amber-300">Models and pricing: awaiting supplier verification.</p>
      </section>
      <section className="glass rounded-3xl p-7">
        <h2 className="text-2xl font-semibold">Solar chest refrigerators & freezers</h2>
        <p className="mt-3 text-muted-foreground">A top-opening format worth considering for remote properties and larger food-storage needs. Refrigerator and freezer functions vary by model.</p>
        <p className="mt-6 text-sm text-amber-300">Models and pricing: awaiting supplier verification.</p>
      </section>
    </div>
    <section className="mt-14 rounded-3xl border border-border p-7 sm:p-10">
      <h2 className="text-2xl font-semibold">What we'll verify before taking orders</h2>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {["Manufacturer model and technical specifications", "US delivery coverage and shipping charges", "Verified pricing and availability", "Warranty, returns and after-sales process"].map(item =>
          <p key={item} className="flex items-start gap-3 text-sm text-muted-foreground"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />{item}</p>
        )}
      </div>
      <p className="mt-8 text-sm text-muted-foreground">This is an informational preview, not a quotation or a product offer. We will add an enquiry form only after confirming a secure way to receive and respond to requests.</p>
      <Link to="/sub-zero" className="mt-6 inline-flex items-center gap-2 rounded-xl border border-border px-5 py-3 text-sm hover:border-primary/50">Browse published refrigeration products <ArrowRight className="size-4" /></Link>
    </section>
  </main>;
}

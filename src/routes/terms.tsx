import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms & Conditions — OddGrid" },
      {
        name: "description",
        content:
          "The terms that govern quotes, orders, delivery, warranty and returns for OddGrid power systems and drones.",
      },
      { property: "og:title", content: "Terms & Conditions — OddGrid" },
      { property: "og:description", content: "Quotes, orders, delivery, warranty and returns." },
      { property: "og:url", content: "/terms" },
    ],
    links: [{ rel: "canonical", href: "/terms" }],
  }),
  component: TermsPage,
});

const sections = [
  {
    title: "Quotes and orders",
    body: "Quotes are valid for 14 days and are subject to stock availability at the time of order confirmation. Prices shown on this site are indicative demonstration figures and are confirmed in writing on your quote.",
  },
  {
    title: "Delivery",
    body: "Stocked items are dispatched within 24 business hours. Delivery timelines for indent and project items are stated on the quote. Risk passes on delivery to the address you supply.",
  },
  {
    title: "Warranty",
    body: "All equipment carries the full manufacturer warranty. Warranty excludes crash damage, water ingress on non-waterproof models, unauthorised modification and consumables such as propellers.",
  },
  {
    title: "Returns",
    body: "Unopened stock items may be returned within 7 days of delivery. Commissioned installations, custom kits and opened aircraft are non-returnable except where faulty.",
  },
  {
    title: "Operator responsibility",
    body: "Drone buyers are responsible for complying with local aviation regulations, registration and licensing. Power installations should be commissioned by a qualified electrician.",
  },
];

function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-4xl font-semibold">Terms & Conditions</h1>
      <p className="mt-4 text-sm text-muted-foreground">
        This is demonstration copy for an illustrative catalogue.
      </p>
      <div className="mt-10 space-y-8">
        {sections.map((s) => (
          <section key={s.title}>
            <h2 className="text-xl font-semibold">{s.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
          </section>
        ))}
      </div>
    </div>
  );
}

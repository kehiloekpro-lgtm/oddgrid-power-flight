import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — OddGrid" },
      {
        name: "description",
        content:
          "How OddGrid collects, uses and protects the information you share through enquiries, quotes and the newsletter.",
      },
      { property: "og:title", content: "Privacy Policy — OddGrid" },
      { property: "og:description", content: "How OddGrid handles your information." },
      { property: "og:url", content: "/privacy" },
    ],
    links: [{ rel: "canonical", href: "/privacy" }],
  }),
  component: PrivacyPage,
});

const sections = [
  {
    title: "What we collect",
    body: "Only what you send us: your name, company, email, phone number and the details of the enquiry or quote request you submit.",
  },
  {
    title: "How we use it",
    body: "To prepare quotes, answer technical questions, arrange delivery and — if you opt in — send occasional product news. We do not sell your information.",
  },
  {
    title: "Storage on your device",
    body: "Your quote list is stored locally in your browser so it survives a page refresh. It is never transmitted anywhere until you submit a quote request.",
  },
  {
    title: "Sharing",
    body: "We share only what is necessary with couriers and, where a manufacturer warranty claim is involved, with the relevant brand.",
  },
  {
    title: "Your choices",
    body: "You can ask us to correct or delete your details at any time by emailing sales@oddgrid.com. Newsletter emails include an unsubscribe link.",
  },
];

function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-4xl font-semibold">Privacy Policy</h1>
      <p className="mt-4 text-sm text-muted-foreground">
        This page is maintained by OddGrid and describes practices for this demonstration
        catalogue.
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

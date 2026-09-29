import { createFileRoute, Link } from "@tanstack/react-router";
import { MessageCircle, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { WHATSAPP_URL } from "@/lib/products";
import { useQuote } from "@/lib/quote-store";

export const Route = createFileRoute("/quote")({
  head: () => ({
    meta: [
      { title: "Request a Quote — OddGrid" },
      {
        name: "description",
        content:
          "Build a quote list of OddGrid power systems and drones and send it to our team for specification and pricing.",
      },
      { property: "og:title", content: "Request a Quote — OddGrid" },
      {
        property: "og:description",
        content: "Send your equipment list to OddGrid for specification and pricing.",
      },
      { property: "og:url", content: "/quote" },
    ],
    links: [{ rel: "canonical", href: "/quote" }],
  }),
  component: QuotePage,
});

function QuotePage() {
  const { items, remove, clear } = useQuote();
  const [sending, setSending] = useState(false);

  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
      <h1 className="text-4xl font-semibold sm:text-5xl">Request a quote</h1>
      <p className="mt-4 max-w-2xl text-muted-foreground">
        No checkout, no card. Add the equipment you need and our team returns a specified, priced
        proposal.
      </p>

      <div className="mt-12 grid gap-8 lg:grid-cols-[1fr_1.2fr]">
        <div className="glass rounded-4xl p-6 sm:p-8">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
            <h2 className="truncate text-xl font-semibold">Your list</h2>
            {items.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clear} className="shrink-0">
                Clear
              </Button>
            )}
          </div>

          {items.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-muted-foreground">Your quote list is empty.</p>
              <div className="mt-5 flex justify-center gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link to="/sub-zero">Browse refrigeration</Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link to="/solar-hvac">Browse air-cons</Link>
                </Button>
              </div>
            </div>
          ) : (
            <ul className="mt-6 space-y-3">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-3 rounded-2xl border border-border px-4 py-3"
                >
                  <Link
                    to="/products/$productId"
                    params={{ productId: item.id }}
                    className="min-w-0 flex-1 truncate text-sm hover:text-primary"
                  >
                    {item.name}
                  </Link>
                  <span className="shrink-0 text-sm text-muted-foreground">×{item.qty}</span>
                  <button
                    onClick={() => remove(item.id)}
                    aria-label={`Remove ${item.name}`}
                    className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <form
          className="glass grid gap-5 rounded-4xl p-6 sm:p-8"
          onSubmit={(e) => {
            e.preventDefault();
            setSending(true);
            setTimeout(() => {
              setSending(false);
              (e.target as HTMLFormElement).reset();
              clear();
              toast.success("Quote request sent. We'll reply within one business day.");
            }, 600);
          }}
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="q-name">Full name</Label>
              <Input id="q-name" required placeholder="Alex Mercer" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="q-email">Email</Label>
              <Input id="q-email" type="email" required placeholder="alex@company.com" />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="q-notes">Project notes</Label>
            <Textarea
              id="q-notes"
              rows={6}
              placeholder="Loads to run, hours of backup needed, flight missions, timelines."
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" size="lg" disabled={sending}>
              {sending ? "Sending…" : "Send quote request"}
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href={WHATSAPP_URL} target="_blank" rel="noreferrer">
                <MessageCircle className="size-4" /> WhatsApp instead
              </a>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

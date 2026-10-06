import { createFileRoute } from "@tanstack/react-router";
import { Clock, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { WHATSAPP_URL } from "@/lib/products";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact OddGrid — Business Enquiries & Support" },
      {
        name: "description",
        content:
          "Talk to OddGrid about power systems, drone fleets, dealer pricing and technical support. WhatsApp, email and business hours.",
      },
      { property: "og:title", content: "Contact OddGrid" },
      {
        property: "og:description",
        content: "Business enquiries, dealer pricing and technical support.",
      },
      { property: "og:url", content: "/contact" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/contact" }],
  }),
  component: ContactPage,
});

function ContactPage() {
  const [sending, setSending] = useState(false);

  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
      <h1 className="text-4xl font-semibold sm:text-5xl">Let's talk</h1>
      <p className="mt-4 max-w-2xl text-muted-foreground">
        Send us the requirement — site load, flight mission, fleet size — and a specialist will come
        back with a specification and pricing.
      </p>

      <div className="mt-12 grid gap-8 lg:grid-cols-[1.3fr_1fr]">
        <form
          className="glass grid gap-5 rounded-4xl p-6 sm:p-8"
          onSubmit={(e) => {
            e.preventDefault();
            setSending(true);
            setTimeout(() => {
              setSending(false);
              (e.target as HTMLFormElement).reset();
              toast.success("Enquiry sent. We reply within one business day.");
            }, 600);
          }}
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="name" label="Full name" placeholder="Alex Mercer" />
            <Field id="company" label="Company" placeholder="Mercer Marine" required={false} />
            <Field id="email" label="Email" type="email" placeholder="alex@company.com" />
            <Field id="phone" label="Phone" placeholder="+1 555 0100" required={false} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="message">How can we help?</Label>
            <Textarea
              id="message"
              required
              rows={6}
              placeholder="Tell us about the site, mission or fleet you're equipping."
            />
          </div>
          <Button type="submit" size="lg" disabled={sending} className="w-fit">
            {sending ? "Sending…" : "Send enquiry"}
          </Button>
        </form>

        <div className="grid gap-5">
          <InfoCard icon={MessageCircle} title="WhatsApp">
            <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" className="text-primary">
              Chat with a specialist
            </a>
          </InfoCard>
          <InfoCard icon={Mail} title="Email">
            <a href="mailto:sales@oddgrid.com" className="text-primary">
              sales@oddgrid.com
            </a>
          </InfoCard>
          <InfoCard icon={Phone} title="Phone">
            +1 (555) 010-0100
          </InfoCard>
          <InfoCard icon={Clock} title="Business hours">
            Mon – Fri: 08:00 – 17:00
            <br />
            Sat: 09:00 – 13:00
          </InfoCard>
          <InfoCard icon={MapPin} title="Showroom">
            Unit 4, Grid Park, Technology Way
          </InfoCard>
          <div className="glass grid h-56 place-items-center rounded-3xl text-sm text-muted-foreground">
            Google Maps embed placeholder
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  placeholder,
  type = "text",
  required = true,
}: {
  id: string;
  label: string;
  placeholder: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} placeholder={placeholder} required={required} />
    </div>
  );
}

function InfoCard({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Mail;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass flex gap-4 rounded-3xl p-5">
      <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary ring-1 ring-primary/25">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}

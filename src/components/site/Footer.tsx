import { Link } from "@tanstack/react-router";
import { Facebook, Instagram, Linkedin, Youtube, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WHATSAPP_URL } from "@/lib/products";

export function Footer() {
  const [email, setEmail] = useState("");

  return (
    <footer className="mt-24 border-t border-border bg-surface/40">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="space-y-4">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/30">
              <Zap className="size-5" />
            </span>
            <span className="text-lg font-semibold">OddGrid</span>
          </Link>
          <p className="max-w-sm text-sm text-muted-foreground">
            Solar refrigeration, portable cooling and backup power for homes, businesses, farms
            and adventurers.
          </p>
          <form
            className="flex max-w-sm gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!email.trim()) return;
              setEmail("");
              toast.success("You're on the list. Product drops land in your inbox.");
            }}
          >
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Newsletter email"
              aria-label="Newsletter email"
            />
            <Button type="submit">Join</Button>
          </form>
          <div className="flex gap-2 pt-2">
            {[Instagram, Facebook, Youtube, Linkedin].map((Icon, i) => (
              <a
                key={i}
                href={WHATSAPP_URL}
                className="grid size-9 place-items-center rounded-xl border border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                aria-label="OddGrid social profile"
              >
                <Icon className="size-4" />
              </a>
            ))}
          </div>
        </div>

        <FooterColumn
          title="Categories"
          links={[
            { label: "Sub-zero", to: "/sub-zero" },
  { label: "Solar HVAC", to: "/solar-hvac" },
  { label: "Back-up power", to: "/back-up-power" },
  { label: "Hybrid Inverters", to: "/hybrid-inverters" },
            { label: "Request Quote", to: "/quote" },
          ]}
        />
        <FooterColumn
          title="Company"
          links={[
            { label: "About", to: "/about" },
            { label: "Contact", to: "/contact" },
          ]}
        />
        <FooterColumn
          title="Legal"
          links={[
            { label: "Terms", to: "/terms" },
            { label: "Privacy Policy", to: "/privacy" },
          ]}
        />
      </div>
      <div className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} OddGrid. Demonstration catalogue — product data is
        illustrative.
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { label: string; to: string }[];
}) {
  return (
    <div>
      <h4 className="text-sm font-semibold tracking-[0.16em] uppercase">{title}</h4>
      <ul className="mt-4 space-y-2.5">
        {links.map((l) => (
          <li key={l.to}>
            <Link
              to={l.to}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

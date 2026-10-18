import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DEMO_REFRIGERATOR, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase-config";
import { getPreviewProductById, getPublicProductDetails, listPublicCategories, resolvePublicProductImage, type PublicSupabaseProduct, type PublicProductImage, type PublicProductSpec, type PublicProductSpecSection } from "@/lib/supabase-products";

export const Route = createFileRoute("/admin-preview")({
  head: () => ({ meta: [{ title: "OddGrid — Private Preview" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: AdminPreview,
});

function AdminPreview() {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [product, setProduct] = useState<PublicSupabaseProduct | null>(null);
  const [images, setImages] = useState<PublicProductImage[]>([]);
  const [specs, setSpecs] = useState<PublicProductSpec[]>([]);
  const [sections, setSections] = useState<PublicProductSpecSection[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    // Supabase's implicit magic-link flow returns credentials in the URL fragment.
    // Remove the fragment immediately; never persist the token in localStorage.
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = fragment.get("access_token");
    if (accessToken && fragment.get("token_type") === "bearer") {
      window.history.replaceState(null, "", window.location.pathname);
      setToken(accessToken);
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setMessage("Loading authorized preview…");
    Promise.all([
      getPreviewProductById(DEMO_REFRIGERATOR.id, token),
      getPublicProductDetails(DEMO_REFRIGERATOR.id, token),
      listPublicCategories(),
    ]).then(([record, details, categoryRows]) => {
      if (cancelled) return;
      if (!record || record.status !== "draft") {
        setMessage("Draft access denied. Sign in with an authorized administrator account.");
        return;
      }
      setProduct(record);
      setImages(details.images);
      setSpecs(details.specs);
      setSections(details.sections);
      setCategories(categoryRows);
      setMessage("");
    }).catch(() => {
      if (!cancelled) setMessage("Preview access denied or session expired. Request another magic link.");
    });
    return () => { cancelled = true; };
  }, [token]);

  async function sendMagicLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!SUPABASE_PUBLISHABLE_KEY) { setMessage("Supabase publishable key is not configured."); return; }
    setMessage("Sending sign-in link…");
    try {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/otp?redirect_to=${encodeURIComponent(window.location.origin + "/admin-preview")}`, {
        method: "POST",
        headers: { apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email, create_user: false, email_redirect_to: window.location.origin + "/admin-preview" }),
      });
      if (!response.ok) throw new Error("Unable to request sign-in link");
      setMessage("If this email is registered, check your inbox for the sign-in link.");
    } catch { setMessage("Unable to request sign-in link. Check Auth configuration."); }
  }

  const gallery = images
    .map((item) => ({ src: resolvePublicProductImage(item), alt: item.alt_text ?? product?.name ?? "Product", order: item.display_order, primary: item.is_primary }))
    .filter((item): item is typeof item & { src: string } => !!item.src)
    .sort((a, b) => Number(b.primary) - Number(a.primary) || a.order - b.order);

  return <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
    <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-4 text-sm">
      PRIVATE DEMONSTRATION — Not a live product listing. Specifications and availability are unverified. Checkout disabled.
    </div>
    <h1 className="mt-8 text-3xl font-semibold">Administrator product preview</h1>
    {!product && <form onSubmit={sendMagicLink} className="mt-8 flex max-w-lg flex-col gap-3">
      <label htmlFor="admin-email">Administrator email</label>
      <input id="admin-email" className="rounded-lg border border-border bg-background p-3" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <button type="submit" className="rounded-lg bg-primary px-4 py-3 text-primary-foreground">Send magic link</button>
    </form>}
    {message && <p role="status" className="mt-5 text-muted-foreground">{message}</p>}
    {product && <>
      <p className="mt-6 text-sm text-muted-foreground">Draft · {categories.find((cat) => cat.id === product.category_id)?.name ?? "Uncategorized"} · {product.sku}</p>
      <h2 className="mt-2 text-3xl font-semibold">{product.name}</h2>
      {product.description && <p className="mt-4 whitespace-pre-line">{product.description}</p>}
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {gallery.map((item) => <img key={item.src} src={item.src} alt={item.alt} className="w-full rounded-xl object-cover" />)}
      </div>
      <h3 className="mt-10 text-2xl font-semibold">Technical specifications</h3>
      {sections.map((section) => <section key={section.id} className="mt-6 rounded-xl border border-border p-5">
        <h4 className="font-semibold">{section.name}</h4>
        <dl className="mt-3 space-y-2">{specs.filter((spec) => spec.section_id === section.id).map((spec) =>
          <div key={spec.id} className="flex justify-between gap-5 text-sm"><dt>{spec.label}</dt><dd className="text-right text-muted-foreground">{spec.value}</dd></div>
        )}</dl>
      </section>)}
      <button className="mt-8 rounded-lg border border-border px-4 py-2" onClick={() => { setToken(null); setProduct(null); setMessage("Signed out of this preview."); }}>Close preview session</button>
    </>}
  </div>;
}

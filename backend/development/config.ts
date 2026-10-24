/** Server only. Deployment cannot point this integration at Production. */
export const DEVELOPMENT_URL = "https://ogbnpvroaafgpnlxeftw.supabase.co";
export function developmentConfiguration(env: (name: string) => string | undefined) {
  if (
    env("SUPABASE_URL") !== DEVELOPMENT_URL ||
    env("ODDGRID_DEVELOPMENT_PURCHASING_APPROVED") !== "ogbnpvroaafgpnlxeftw"
  )
    throw new Error("Development purchasing is disabled");
  const key = env("ODDGRID_DEVELOPMENT_PUBLISHABLE_KEY");
  const origins = (env("ODDGRID_DEVELOPMENT_ORIGINS") ?? "")
    .split(",")
    .map((value) => value.trim());
  if (
    !key ||
    !origins.length ||
    origins.some((origin) => {
      try {
        const url = new URL(origin);
        return (
          url.origin !== origin ||
          !!url.username ||
          !!url.password ||
          (url.protocol !== "https:" &&
            !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) ||
          ["oddgrid.co.za", "www.oddgrid.co.za"].includes(url.hostname)
        );
      } catch {
        return true;
      }
    })
  )
    throw new Error("Invalid Development configuration");
  return { url: DEVELOPMENT_URL, key, origins };
}
/** apikey is a public application key, not guest ownership proof. */
export function developmentGateway(
  request: Request,
  config: ReturnType<typeof developmentConfiguration>,
): Response | null {
  const origin = request.headers.get("Origin");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
  if (origin && config.origins.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  if (origin && !config.origins.includes(origin))
    return new Response(JSON.stringify({ error: "Origin not allowed" }), { status: 403, headers });
  if (request.method !== "OPTIONS" && request.headers.get("apikey") !== config.key)
    return new Response(JSON.stringify({ error: "Application key required" }), {
      status: 401,
      headers,
    });
  return null;
}

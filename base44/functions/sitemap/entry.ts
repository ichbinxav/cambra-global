// Serves /sitemap.xml — lists every PUBLIC route (no auth-walled pages).
// Kept in sync with src/lib/seoConfig.js by src/lib/seoSurface.test.js. When a
// public page is added/removed, update PUBLIC_ROUTES and the canonical SEO map
// in the same change.
//
// Also serves /robots.txt via ?type=robots so both live behind one function
// (Base44 backend functions have a single path, so we dispatch on query).

// Normalize APP_DOMAIN — accepts a bare hostname or an HTTPS origin. Reject
// credentials, ports, paths, query strings and fragments so configuration can
// never inject untrusted text into the generated XML.
function resolveSiteUrl(): string {
  const raw = (Deno.env.get("APP_DOMAIN") || "cambra.global").trim();
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const parsed = new URL(candidate);
  const hostname = parsed.hostname.toLowerCase();
  const labelsAreSafe = hostname.split(".").every((label) =>
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)
  );
  if (
    parsed.protocol !== "https:" || parsed.username || parsed.password ||
    parsed.port || (parsed.pathname && parsed.pathname !== "/") ||
    parsed.search || parsed.hash || !labelsAreSafe
  ) throw new Error("INVALID_APP_DOMAIN");
  return `https://${hostname}`;
}
const SITE_URL = resolveSiteUrl();

// [path, changefreq, priority] — path is what appears after the domain.
// Only include routes that DON'T require authentication.
// Retired developer surfaces remain excluded. Every entry below must have an
// indexable canonical counterpart in SEO_STATIC.
const PUBLIC_ROUTES: Array<[string, string, string]> = [
  ["/",              "weekly",  "1.0"],
  ["/Analyzer",      "weekly",  "0.9"],
  ["/HowItWorks",    "monthly", "0.8"],
  ["/Pricing",       "monthly", "0.8"],
  ["/Partners",      "monthly", "0.7"],
  ["/ForProviders",  "monthly", "0.7"],
  ["/Contact",       "monthly", "0.6"],
  ["/Security",      "monthly", "0.5"],
  ["/Help",          "weekly",  "0.7"],
  ["/Privacy",       "yearly",  "0.3"],
  ["/Terms",         "yearly",  "0.3"],
  ["/Dpa",           "yearly",  "0.3"],
  ["/Subprocessors", "monthly", "0.3"],
  ["/Cookies",       "yearly",  "0.3"],
];

function buildSitemap(): string {
  const urls = PUBLIC_ROUTES.map(([path, changefreq, priority]) => `  <url>
    <loc>${SITE_URL}${path}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

function buildRobots(): string {
  // CHUNK SEO-1 — single coherent policy:
  //  · React HTML pages (everything the SPA renders) are de-indexed ONLY via
  //    the client-side noindex meta injected by RobotsMeta. They must NOT be
  //    Disallow'd here — a blocked path is never rendered, so Googlebot never
  //    sees the noindex and may index the bare URL from an external link.
  //  · Non-HTML endpoints (backend functions, OAuth callbacks/redirects that
  //    return JSON/redirects and never render the SPA) have no meta a bot can
  //    read, so Disallow is the correct mechanism and stays here.
  return `User-agent: *
Allow: /
Disallow: /functions/
Disallow: /auth/

Sitemap: ${SITE_URL}/functions/sitemap
`;
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const type = url.searchParams.get("type");

    if (type === "robots") {
      return new Response(buildRobots(), {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    return new Response(buildSitemap(), {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    console.error("[sitemap] generation failed", { code: "SITEMAP_GENERATION_FAILED" });
    return Response.json(
      { error: "SITEMAP_GENERATION_FAILED" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
});

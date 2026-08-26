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
  ["/how-it-works",  "monthly", "0.8"],
  ["/pricing",       "monthly", "0.8"],
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
  // Defense in depth: access control and route-level noindex remain the real
  // protection; these directives prevent routine crawling of known private
  // surfaces and match the static public/robots.txt policy.
  return `User-agent: *
Allow: /
Disallow: /admin
Disallow: /dev/
Disallow: /internal/
Disallow: /debug/
Disallow: /test/
Disallow: /staging/
Disallow: /api/
Disallow: /functions/
Disallow: /auth/
Disallow: /Dashboard
Disallow: /Reports
Disallow: /Account
Disallow: /Invoices
Disallow: /Vault
Disallow: /Referrals
Disallow: /ConnectTools
Disallow: /IntegrationsCallback
Disallow: /Onboarding
Disallow: /BrandProfile
Disallow: /Results
Disallow: /LoginGate
Disallow: /OAuthConsent
Disallow: /HealthCheck

Sitemap: ${SITE_URL}/sitemap.xml
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

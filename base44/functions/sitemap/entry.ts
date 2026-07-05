// Serves /sitemap.xml — lists every PUBLIC route (no auth-walled pages).
// Kept in sync manually with src/App.jsx public routes. When a public page is
// added/removed, update PUBLIC_ROUTES below.
//
// Also serves /robots.txt via ?type=robots so both live behind one function
// (Base44 backend functions have a single path, so we dispatch on query).

// Normalize APP_DOMAIN — accepts values like "cambra.global", "https://cambra.global",
// or with trailing slash. Always produces "https://<host>" with no trailing slash.
function resolveSiteUrl(): string {
  const raw = (Deno.env.get("APP_DOMAIN") || "cambra.global").trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}
const SITE_URL = resolveSiteUrl();

// [path, changefreq, priority] — path is what appears after the domain.
// Only include routes that DON'T require authentication.
const PUBLIC_ROUTES: Array<[string, string, string]> = [
  ["/",              "weekly",  "1.0"],
  ["/Analyzer",      "weekly",  "0.9"],
  ["/HowItWorks",    "monthly", "0.8"],
  ["/Pricing",       "monthly", "0.8"],
  ["/Developers",    "monthly", "0.7"],
  ["/Developers/MCP","monthly", "0.6"],
  ["/Testimonials",  "monthly", "0.6"],
  ["/Contact",       "monthly", "0.6"],
  ["/Help",          "weekly",  "0.7"],
  ["/Privacy",       "yearly",  "0.3"],
  ["/Terms",         "yearly",  "0.3"],
  ["/Cookies",       "yearly",  "0.3"],
];

function buildSitemap(): string {
  const today = new Date().toISOString().split("T")[0];
  const urls = PUBLIC_ROUTES.map(([path, changefreq, priority]) => `  <url>
    <loc>${SITE_URL}${path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

function buildRobots(): string {
  return `User-agent: *
Allow: /
Disallow: /admin
Disallow: /Dashboard
Disallow: /Account
Disallow: /Reports
Disallow: /Network
Disallow: /Insights
Disallow: /Vault
Disallow: /Invoices
Disallow: /ConnectIntegrations
Disallow: /ConnectTools
Disallow: /StripeAnalyzer
Disallow: /Results
Disallow: /AnalyzerTeaser
Disallow: /IntegrationsCallback
Disallow: /LoginGate
Disallow: /auth
Disallow: /dev

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
  } catch (error) {
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
});
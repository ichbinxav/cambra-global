import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// SEO-1 (2026-08-05) — Centralized SEO surface tests. Verifies the single
// source of truth (seoConfig.js), the writer (SeoMeta.jsx), sitemap/robots
// sync, and that no competing system remains (RobotsMeta removed, Partners no
// longer sets its own meta, i18n no longer writes route meta).

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, "..", "..");

function readFile(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), "utf-8");
}

function listFilesRecursive(rel) {
  const absolute = path.join(REPO_ROOT, rel);
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(rel, entry.name);
    return entry.isDirectory() ? listFilesRecursive(child) : [child];
  });
}

const seoConfig = readFile("src/lib/seoConfig.js");
const seoMeta = readFile("src/components/shared/SeoMeta.jsx");
const indexHtml = readFile("index.html");
const sitemap = readFile("public/sitemap.xml");
const functionSitemap = readFile("base44/functions/sitemap/entry.ts");
const robots = readFile("public/robots.txt");
const securityTxt = readFile("public/.well-known/security.txt");
const manifest = JSON.parse(readFile("public/manifest.json"));
const appIcon = readFile("public/icons/cambra-app-icon.svg");
const healthCheck = readFile("src/pages/HealthCheck.jsx");
const viteConfig = readFile("vite.config.js");
const appJsx = readFile("src/App.jsx");
const i18n = readFile("src/lib/i18n.jsx");
const partnersJsx = readFile("src/pages/Partners.jsx");
const adminOverview = readFile("src/pages/admin/AdminOverview.jsx");
const copilotBrief = readFile("src/components/admin/command/CopilotBrief.jsx");
const devExport = readFile("src/pages/DevExport.jsx");

// Lightweight extraction of the SEO_STATIC map from seoConfig.js source.
// We import the module to read the real export.
async function importSeoConfig() {
  const url = new URL("./seoConfig.js", import.meta.url);
  return import(url.href);
}

describe("SEO architecture — single source of truth", () => {
  it("seoConfig.js exists and exports SEO_STATIC", async () => {
    const mod = await importSeoConfig();
    expect(mod.SEO_STATIC).toBeTruthy();
    expect(typeof mod.SEO_STATIC).toBe("object");
  });

  it("SeoMeta.jsx is the writer and imports seoConfig", () => {
    expect(seoMeta).toContain("from \"@/lib/seoConfig.js\"");
    expect(seoMeta).toContain("getSeoForPathLang");
    expect(seoMeta).toContain("useLocation");
    expect(seoMeta).toContain("useTranslation");
  });

  it("RobotsMeta is removed from App.jsx and replaced by SeoMeta", () => {
    expect(appJsx).not.toContain("RobotsMeta");
    expect(appJsx).toContain("SeoMeta");
  });

  it("RobotsMeta file is deleted", () => {
    expect(fs.existsSync(path.join(REPO_ROOT, "src/components/shared/RobotsMeta.jsx"))).toBe(false);
  });

  it("i18n no longer writes route meta tags (no ensureMeta / og:title writes)", () => {
    expect(i18n).not.toContain("ensureMeta");
    // i18n keeps only <html lang>
    expect(i18n).toContain("document.documentElement.lang = lang");
    // and must NOT write document.title / og / twitter
    expect(i18n).not.toMatch(/document\.title\s*=/);
    expect(i18n).not.toContain('meta[property="og:title"]');
    expect(i18n).not.toContain('meta[name="twitter:title"]');
  });

  it("Partners no longer sets document.title or description locally", () => {
    expect(partnersJsx).not.toMatch(/document\.title\s*=/);
    expect(partnersJsx).not.toContain("pt_meta_title");
    expect(partnersJsx).not.toContain("pt_meta_description");
    // no useEffect import left over
    expect(partnersJsx).not.toMatch(/import\s*\{[^}]*useEffect[^}]*\}\s*from\s*["']react["']/);
  });
});

describe("Canonical aliases and retired admin routes", () => {
  it("redirects both Landing aliases directly to the canonical root", () => {
    expect(appJsx).toContain('<Route path="/Landing" element={<Navigate to="/" replace />} />');
    expect(appJsx).toContain('<Route path="/landing" element={<Navigate to="/" replace />} />');
  });

  it("does not expose executable links to retired admin surfaces", () => {
    expect(adminOverview).not.toContain('"/admin/applications"');
    expect(copilotBrief).not.toContain('to="/admin/copilot"');
    expect(copilotBrief).toContain('to="/admin/command"');
    expect(devExport).not.toContain('"/admin/applications"');
  });

  it("keeps test files outside src/pages so Base44 cannot publish them as pages", () => {
    const pageTests = listFilesRecursive("src/pages")
      .filter((file) => /\.test\.[jt]sx?$/.test(file));
    expect(pageTests).toEqual([]);
  });

  it("does not link public surfaces to admin routes", () => {
    const publicFiles = [
      "src/pages/Landing.jsx", "src/pages/PaymentsAnalyzer.jsx", "src/pages/HowItWorks.jsx",
      "src/pages/Pricing.jsx", "src/pages/Partners.jsx", "src/pages/ForProviders.jsx",
      "src/pages/Contact.jsx", "src/pages/Security.jsx", "src/pages/Help.jsx",
      "src/pages/Privacy.jsx", "src/pages/Terms.jsx", "src/pages/Dpa.jsx",
      "src/pages/Subprocessors.jsx", "src/pages/Cookies.jsx",
      ...listFilesRecursive("src/components/landing").filter((file) =>
        /\.[jt]sx?$/.test(file) && !/(?:Navbar|MobileNavMenu)\.jsx$/.test(file)),
    ];
    const source = publicFiles.map(readFile).join("\n");
    expect(source).not.toMatch(/(?:href|to)\s*=\s*["']\/admin(?:\/|["'])/);
    expect(source).not.toMatch(/href\s*:\s*["']\/admin(?:\/|["'])/);

    const navbar = readFile("src/components/landing/Navbar.jsx");
    const mobileNav = readFile("src/components/landing/MobileNavMenu.jsx");
    expect(navbar).toContain("{isAdmin && (");
    expect(navbar.indexOf('to="/admin"')).toBeGreaterThan(navbar.indexOf("{isAdmin && ("));
    expect(mobileNav).toContain("{isAuthenticated && isAdmin && (");
    expect(mobileNav.indexOf('href: "/admin"')).toBeGreaterThan(
      mobileNav.indexOf("{isAuthenticated && isAdmin && ("),
    );
  });

  it("guards every admin renderer behind authentication and the admin role", () => {
    const guard = appJsx.slice(
      appJsx.indexOf("const AdminRoute"),
      appJsx.indexOf("const AuthenticatedApp"),
    );
    expect(guard).toContain("if (!isAuthenticated)");
    expect(guard).toContain('user?.role !== "admin"');
    expect(guard.indexOf("if (!isAuthenticated)")).toBeLessThan(guard.lastIndexOf("return children"));

    const shellStart = appJsx.indexOf('<Route element={<AdminRoute><AdminLayout /></AdminRoute>}>');
    const shellEnd = appJsx.indexOf("</Route>", shellStart);
    const adminRenderers = [...appJsx.matchAll(/<Route path="(\/admin[^"]*)"/g)];
    expect(shellStart).toBeGreaterThan(-1);
    expect(adminRenderers.length).toBeGreaterThan(0);
    adminRenderers.forEach((match) => {
      expect(match.index).toBeGreaterThan(shellStart);
      expect(match.index).toBeLessThan(shellEnd);
    });
  });

  it("keeps public canonical and alias routes case-sensitive so aliases redirect", () => {
    const caseSensitivePaths = [
      "/Analyzer", "/analyzer", "/Privacy", "/privacy", "/Terms", "/terms",
      "/Cookies", "/cookies", "/Dpa", "/dpa", "/Subprocessors", "/subprocessors",
      "/ForProviders", "/forproviders", "/for-providers", "/Partners", "/partners",
      "/pricing", "/Pricing", "/how-it-works", "/HowItWorks", "/howitworks",
      "/Security", "/security", "/Contact", "/contact", "/Help", "/help",
      "/Help/:slug", "/help/:slug",
    ];
    caseSensitivePaths.forEach((route) => {
      expect(appJsx).toContain(`caseSensitive path="${route}"`);
    });
    expect(appJsx).toContain('path="/Pricing" element={<Navigate to="/pricing" replace />}');
    expect(appJsx).toContain('path="/privacy" element={<Navigate to="/Privacy" replace />}');
  });
});

describe("PWA assets and client health truthfulness", () => {
  it("uses one local square vector icon without false raster dimensions", () => {
    expect(manifest.icons).toEqual([{
      src: "/icons/cambra-app-icon.svg",
      sizes: "any",
      type: "image/svg+xml",
      purpose: "any maskable",
    }]);
    expect(appIcon).toContain('viewBox="0 0 1024 1024"');
    expect(indexHtml).toContain('href="/icons/cambra-app-icon.svg"');
  });

  it("injects a build identity and never claims freshness from a fixed date", () => {
    expect(healthCheck).toContain("VITE_CAMBRA_BUILD_STAMP");
    expect(healthCheck).toContain("client bundle loaded");
    expect(healthCheck).not.toContain("20260626-force");
    expect(healthCheck).not.toContain("bundle is fresh");
    expect(viteConfig).toContain("CAMBRA_RELEASE_GIT_SHA");
    expect(viteConfig).toContain("BASE44_COMMIT_SHA");
  });
});

describe("SEO config — every public route is complete", () => {
  let SEO_STATIC, CANONICAL_PUBLIC_PATHS, NOINDEX_ROBOTS, buildCanonicalUrl, getSeoForPathLang;
  beforeAll(async () => {
    const mod = await importSeoConfig();
    SEO_STATIC = mod.SEO_STATIC;
    CANONICAL_PUBLIC_PATHS = mod.CANONICAL_PUBLIC_PATHS;
    NOINDEX_ROBOTS = mod.NOINDEX_ROBOTS;
    buildCanonicalUrl = mod.buildCanonicalUrl;
    getSeoForPathLang = mod.getSeoForPathLang;
  });

  const LANGS = ["en", "fr", "es"];
  const EXPECTED_ROUTES = [
    "/", "/Analyzer", "/how-it-works", "/pricing", "/Partners", "/ForProviders",
    "/Contact", "/Security", "/Help", "/Privacy", "/Terms", "/Dpa",
    "/Subprocessors", "/Cookies",
  ];

  it("has exactly the expected canonical public routes", () => {
    EXPECTED_ROUTES.forEach((r) => expect(SEO_STATIC[r]).toBeTruthy());
    // No alias/lowercase/redirect routes leak into the config.
    expect(SEO_STATIC["/Landing"]).toBeUndefined();
    expect(SEO_STATIC["/landing"]).toBeUndefined();
    expect(SEO_STATIC["/Results"]).toBeUndefined();
    expect(SEO_STATIC["/Dashboard"]).toBeUndefined();
    expect(SEO_STATIC["/admin"]).toBeUndefined();
    expect(SEO_STATIC["/HowItWorks"]).toBeUndefined();
    expect(SEO_STATIC["/Pricing"]).toBeUndefined();
  });

  it.each(EXPECTED_ROUTES)("%s has a canonicalPath", (r) => {
    expect(SEO_STATIC[r].canonicalPath).toBeTruthy();
  });

  it.each(EXPECTED_ROUTES)("%s has non-empty title in EN/FR/ES", (r) => {
    LANGS.forEach((l) => {
      const t = SEO_STATIC[r].title[l];
      expect(typeof t).toBe("string");
      expect(t.trim().length).toBeGreaterThan(0);
    });
  });

  it.each(EXPECTED_ROUTES)("%s has non-empty description in EN/FR/ES", (r) => {
    LANGS.forEach((l) => {
      const d = SEO_STATIC[r].description[l];
      expect(typeof d).toBe("string");
      expect(d.trim().length).toBeGreaterThan(0);
    });
  });

  it("every route has an ogType and robots", () => {
    EXPECTED_ROUTES.forEach((r) => {
      expect(SEO_STATIC[r].ogType).toBeTruthy();
      expect(SEO_STATIC[r].robots).toBe("index, follow");
    });
  });

  it("all canonical paths are unique", () => {
    const paths = EXPECTED_ROUTES.map((r) => SEO_STATIC[r].canonicalPath);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("canonical path matches the route key for static routes", () => {
    EXPECTED_ROUTES.forEach((r) => {
      expect(SEO_STATIC[r].canonicalPath).toBe(r);
    });
  });

  it("buildCanonicalUrl normalizes root with trailing slash, others without", () => {
    expect(buildCanonicalUrl("/")).toBe("https://cambra.global/");
    expect(buildCanonicalUrl("/Partners")).toBe("https://cambra.global/Partners");
    expect(buildCanonicalUrl("/Analyzer")).toBe("https://cambra.global/Analyzer");
    expect(buildCanonicalUrl("/pricing")).toBe("https://cambra.global/pricing");
    expect(buildCanonicalUrl("/how-it-works")).toBe("https://cambra.global/how-it-works");
  });

  it("non-configured routes resolve to null (→ noindex default)", () => {
    expect(getSeoForPathLang("/Dashboard", "en")).toBeNull();
    expect(getSeoForPathLang("/Results", "en")).toBeNull();
    expect(getSeoForPathLang("/Account", "en")).toBeNull();
    expect(getSeoForPathLang("/admin", "en")).toBeNull();
    expect(getSeoForPathLang("/admin/users", "en")).toBeNull();
    expect(getSeoForPathLang("/LoginGate", "en")).toBeNull();
    expect(getSeoForPathLang("/HealthCheck", "en")).toBeNull();
    expect(getSeoForPathLang("/Vault", "en")).toBeNull();
    expect(getSeoForPathLang("/Invoices", "en")).toBeNull();
    expect(getSeoForPathLang("/Landing", "en")).toBeNull();
    expect(getSeoForPathLang("/Pricing", "en")).toBeNull();
    expect(getSeoForPathLang("/HowItWorks", "en")).toBeNull();
    expect(getSeoForPathLang("/admin/commercial-autonomy", "en")).toBeNull();
  });

  it("uses the full private-route robots directive", () => {
    expect(NOINDEX_ROBOTS).toBe("noindex, nofollow, noarchive, nosnippet");
    expect(seoMeta).toContain("NOINDEX_ROBOTS");
    expect(seoMeta).toContain("removeElements");
  });

  it("dynamic /Help/:slug resolves and is indexable", () => {
    const e = getSeoForPathLang("/Help/payments", "en");
    expect(e).toBeTruthy();
    expect(e.canonicalPath).toBe("/Help/payments");
    expect(e.robots).toBe("index, follow");
    expect(e.title.en).toContain("CAMBRA");
  });
});

describe("SEO copy — payments-first scope (no out-of-scope service claims)", () => {
  let SEO_STATIC;
  beforeAll(async () => {
    const mod = await importSeoConfig();
    SEO_STATIC = mod.SEO_STATIC;
  });

  const FORBIDDEN = [
    /\bshipping\b/i,
    /\blogistics\b/i,
    /\bSaaS\b/i,
    /\binsurance\b/i,
    /\bbanking\b/i,
    /\bfinanc(ing|e)\b/i,
  ];

  it("no description in any language claims shipping/SaaS/insurance/banking/financing", () => {
    Object.entries(SEO_STATIC).forEach(([route, cfg]) => {
      ["en", "fr", "es"].forEach((l) => {
        const d = cfg.description[l];
        FORBIDDEN.forEach((re) => {
          expect(re.test(d)).toBe(false);
        });
      });
    });
  });

  it("contains no provisional Copy metadata on any public route", () => {
    Object.values(SEO_STATIC).forEach((cfg) => {
      Object.values(cfg.title).forEach((value) => expect(value).not.toContain("(Copy)"));
      Object.values(cfg.description).forEach((value) => expect(value).not.toContain("(Copy)"));
    });
    expect(SEO_STATIC["/pricing"].title.en).toBe("Pricing | CAMBRA");
    expect(SEO_STATIC["/how-it-works"].title.en).toBe("How It Works | CAMBRA");
  });
});

describe("Sitemap + robots sync with seoConfig", () => {
  let CANONICAL_PUBLIC_PATHS, buildCanonicalUrl;
  beforeAll(async () => {
    const mod = await importSeoConfig();
    CANONICAL_PUBLIC_PATHS = mod.CANONICAL_PUBLIC_PATHS;
    buildCanonicalUrl = mod.buildCanonicalUrl;
  });

  it("sitemap contains every canonical public URL and no aliases", () => {
    CANONICAL_PUBLIC_PATHS.forEach((p) => {
      const url = buildCanonicalUrl(p);
      expect(sitemap).toContain(`<loc>${url}</loc>`);
    });

    const staticRoutes = [...sitemap.matchAll(/<loc>https:\/\/cambra\.global(\/[^<]*)?<\/loc>/g)]
      .map((match) => match[1] || "/");
    expect(staticRoutes).toEqual(CANONICAL_PUBLIC_PATHS);
  });

  it("Base44 sitemap function has exactly the canonical public route set", () => {
    const routeBlock = functionSitemap.match(
      /const PUBLIC_ROUTES:[\s\S]*?= \[([\s\S]*?)\n\];/,
    )?.[1] || "";
    const functionRoutes = [...routeBlock.matchAll(/\["([^"]+)"\s*,/g)]
      .map((match) => match[1]);

    expect(functionRoutes).toEqual(CANONICAL_PUBLIC_PATHS);
    expect(functionSitemap).not.toContain("<lastmod>${today}</lastmod>");
    expect(functionSitemap).not.toMatch(/Error:\s*\$\{error\.(?:message|stack)\}/);
  });

  it("sitemap does NOT contain private or alias routes", () => {
    expect(sitemap).not.toContain("/Results");
    expect(sitemap).not.toContain("/Dashboard");
    expect(sitemap).not.toContain("/admin");
    expect(sitemap).not.toContain("/LoginGate");
    expect(sitemap).not.toContain("/HealthCheck");
    expect(sitemap).not.toContain("/Landing");
    expect(sitemap).not.toContain("/landing");
    expect(sitemap).not.toContain("/Pricing");
    expect(sitemap).not.toContain("/HowItWorks");
  });

  it("robots.txt protects every known private route family", () => {
    [
      "/admin", "/dev/", "/internal/", "/debug/", "/test/", "/staging/", "/api/",
      "/functions/", "/auth/", "/Dashboard", "/Reports", "/Account", "/Invoices",
      "/Vault", "/Referrals", "/ConnectTools", "/IntegrationsCallback", "/Onboarding",
      "/BrandProfile", "/Results", "/LoginGate", "/OAuthConsent", "/HealthCheck",
    ].forEach((route) => expect(robots).toContain(`Disallow: ${route}`));
    expect(robots).toContain("Sitemap: https://cambra.global/sitemap.xml");
  });

  it("never places a noindex route in either sitemap", async () => {
    const { getSeoForPathLang } = await importSeoConfig();
    const routes = [...sitemap.matchAll(/<loc>https:\/\/cambra\.global(\/[^<]*)?<\/loc>/g)]
      .map((match) => match[1] || "/");
    routes.forEach((route) => {
      expect(getSeoForPathLang(route, "en")?.robots).toBe("index, follow");
    });
  });

  it("publishes a canonical RFC 9116 security contact", () => {
    expect(securityTxt).toContain("Contact: mailto:support@cambra.global");
    expect(securityTxt).toContain("Canonical: https://cambra.global/.well-known/security.txt");
    expect(securityTxt).toContain("Policy: https://cambra.global/Security");
    expect(securityTxt).toMatch(/Expires: 2027-08-19T23:59:59Z/);
  });
});

describe("index.html baseline (homepage)", () => {
  it("title describes the payment-entry product and is not a copy/test label", () => {
    const titleMatch = indexHtml.match(/<title>(.*?)<\/title>/);
    const title = titleMatch?.[1] || "";
    expect(title).not.toContain("CAMBRA (Copy)");
    expect(title).not.toMatch(/\btest\b/i);
    expect(title).not.toMatch(/\bstaging\b/i);
    expect(title).not.toMatch(/\bpreview\b/i);
  });

  it("homepage description does not claim shipping/SaaS/logistics", () => {
    const descMatch = indexHtml.match(/<meta\s+name="description"\s+content="(.*?)"\s*\/>/i);
    const desc = descMatch?.[1] || "";
    expect(desc).not.toMatch(/\bshipping\b/i);
    expect(desc).not.toMatch(/\blogistics\b/i);
    expect(desc).not.toMatch(/\bSaaS\b/i);
  });

  it("uses cambra.global as canonical origin", () => {
    expect(indexHtml).toContain("cambra.global");
  });
});

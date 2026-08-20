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

const seoConfig = readFile("src/lib/seoConfig.js");
const seoMeta = readFile("src/components/shared/SeoMeta.jsx");
const indexHtml = readFile("index.html");
const sitemap = readFile("public/sitemap.xml");
const robots = readFile("public/robots.txt");
const securityTxt = readFile("public/.well-known/security.txt");
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
});

describe("SEO config — every public route is complete", () => {
  let SEO_STATIC, CANONICAL_PUBLIC_PATHS, buildCanonicalUrl, getSeoForPathLang;
  beforeAll(async () => {
    const mod = await importSeoConfig();
    SEO_STATIC = mod.SEO_STATIC;
    CANONICAL_PUBLIC_PATHS = mod.CANONICAL_PUBLIC_PATHS;
    buildCanonicalUrl = mod.buildCanonicalUrl;
    getSeoForPathLang = mod.getSeoForPathLang;
  });

  const LANGS = ["en", "fr", "es"];
  const EXPECTED_ROUTES = [
    "/", "/Analyzer", "/HowItWorks", "/Pricing", "/Partners", "/ForProviders",
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
  });

  it("sitemap does NOT contain private or alias routes", () => {
    expect(sitemap).not.toContain("/Results");
    expect(sitemap).not.toContain("/Dashboard");
    expect(sitemap).not.toContain("/admin");
    expect(sitemap).not.toContain("/LoginGate");
    expect(sitemap).not.toContain("/HealthCheck");
    expect(sitemap).not.toContain("/Landing");
    expect(sitemap).not.toContain("/landing");
  });

  it("robots.txt protects /functions/ and /auth/", () => {
    expect(robots).toContain("Disallow: /functions/");
    expect(robots).toContain("Disallow: /auth/");
    expect(robots).toContain("Sitemap: https://cambra.global/sitemap.xml");
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
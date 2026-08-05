import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import process from "node:process";
import {
  CATEGORIES,
  resolve,
  getVisibleCategoriesLocalized,
  getCategoryLocalized,
  getFAQsByCategoryLocalized,
  getAllFAQs,
  getPopularLocalized,
  getTrendingLocalized,
  getHeroPlaceholders,
  getHeroTrending,
  helpUi,
  isRetiredHelpSlug,
  RETIRED_HELP_SLUGS,
} from "@/lib/helpCenterData";
import { getSeoForPathLang, DEFAULT_ROBOTS, NOINDEX_ROBOTS } from "@/lib/seoConfig";

// helpCenterContent re-exports CATEGORY_CONTENT etc.; pull directly for the
// existence checks.
import { CATEGORY_CONTENT, FAQ_CONTENT, POPULAR_CONTENT, HELP_UI } from "@/lib/helpCenterContent";

const readSrc = (rel) => readFileSync(join(process.cwd(), rel), "utf-8");

const LANGS = ["en", "fr", "es"];
const CATEGORY_SLUGS = CATEGORIES.map((c) => c.slug);

describe("Localization architecture — content separated from structure", () => {
  it("helpCenterContent holds localized objects {en,fr,es} for every category", () => {
    for (const slug of CATEGORY_SLUGS) {
      const c = CATEGORY_CONTENT[slug];
      expect(c, `category ${slug} missing content`).toBeTruthy();
      for (const l of LANGS) {
        expect(typeof c.title[l], `${slug}.title.${l}`).toBe("string");
        expect(c.title[l].trim().length).toBeGreaterThan(0);
        expect(typeof c.description[l], `${slug}.description.${l}`).toBe("string");
        expect(c.description[l].trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("every FAQ group has a localized title and localized q/a for all langs", () => {
    for (const g of FAQ_CONTENT) {
      for (const l of LANGS) {
        expect(typeof g.title[l]).toBe("string");
        expect(g.title[l].trim().length).toBeGreaterThan(0);
        for (const item of g.items) {
          expect(typeof item.q[l]).toBe("string");
          expect(item.q[l].trim().length).toBeGreaterThan(0);
          expect(typeof item.a[l]).toBe("string");
          expect(item.a[l].trim().length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("popular + trending + hero placeholders exist in all langs", () => {
    for (const p of POPULAR_CONTENT) {
      for (const l of LANGS) {
        expect(typeof p.title[l]).toBe("string");
        expect(p.title[l].trim().length).toBeGreaterThan(0);
      }
    }
    for (const t of HELP_UI.heroPlaceholders) {
      for (const l of LANGS) {
        expect(typeof t[l]).toBe("string");
        expect(t[l].trim().length).toBeGreaterThan(0);
      }
    }
    for (const t of HELP_UI.heroTrending) {
      for (const l of LANGS) {
        expect(typeof t[l]).toBe("string");
        expect(t[l].trim().length).toBeGreaterThan(0);
      }
    }
  });
});

describe("Fallback strategy — never undefined, never a key, never a rendered object", () => {
  it("resolve returns the requested lang, else falls back to EN, else ''", () => {
    expect(resolve({ en: "Hello", fr: "Bonjour", es: "Hola" }, "fr")).toBe("Bonjour");
    expect(resolve({ en: "Hello", fr: "Bonjour", es: "Hola" }, "es")).toBe("Hola");
    expect(resolve({ en: "Hello" }, "fr")).toBe("Hello"); // missing FR → EN
    expect(resolve({ en: "Hello" }, "xx")).toBe("Hello"); // unknown lang → EN
    expect(resolve(undefined, "fr")).toBe(""); // nothing → ""
    expect(resolve(null, "fr")).toBe("");
    expect(resolve("plain string", "fr")).toBe("plain string");
  });

  it("getCategoryLocalized resolves title/description as strings (never objects)", () => {
    for (const l of LANGS) {
      for (const slug of CATEGORY_SLUGS) {
        const c = getCategoryLocalized(slug, l);
        expect(typeof c.title).toBe("string");
        expect(c.title.trim().length).toBeGreaterThan(0);
        expect(typeof c.description).toBe("string");
        expect(c.description.trim().length).toBeGreaterThan(0);
        // never a raw key, never [object Object]
        expect(c.title).not.toContain("[object Object]");
        expect(c.description).not.toContain("[object Object]");
      }
    }
  });

  it("getAllFAQs(lang) returns string q/a/groupTitle for every FAQ in every lang", () => {
    for (const l of LANGS) {
      const faqs = getAllFAQs(l);
      expect(faqs.length).toBeGreaterThan(0);
      for (const f of faqs) {
        expect(typeof f.q).toBe("string");
        expect(f.q.trim().length).toBeGreaterThan(0);
        expect(typeof f.a).toBe("string");
        expect(f.a.trim().length).toBeGreaterThan(0);
        expect(typeof f.groupTitle).toBe("string");
        expect(f.groupTitle.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("helpUi returns a string for every UI key in every lang", () => {
    const keys = [
      "exploreTitle", "categoriesCount", "searchPlaceholder", "trendingLabel",
      "browseCategories", "noResults", "noResultsHint", "contactLink", "poweredBy",
      "escToClose", "heroBadge", "heroTitleA", "heroTitleB", "heroSubtitle",
      "trendingLabelHero", "popularLabel", "popularTitle", "readArticle",
      "stillExploring", "pickPath", "runAnalyzer", "runAnalyzerDesc",
      "uploadInvoices", "uploadInvoicesDesc", "connectTools", "connectToolsDesc",
      "talkToCambra", "talkToCambraDesc", "helpCenter", "searchKnowledge",
      "articlesComingSoon", "browseOrReach", "talkToCambraShort", "relatedTopics",
      "wasThisHelpful", "yes", "no", "thanks", "openSearch",
    ];
    for (const k of keys) {
      for (const l of LANGS) {
        const v = helpUi(l, k);
        expect(typeof v).toBe("string");
        expect(v.length).toBeGreaterThan(0);
        expect(v).not.toContain("[object Object]");
      }
    }
  });

  it("getPopularLocalized / getTrendingLocalized / hero placeholders return strings", () => {
    for (const l of LANGS) {
      for (const p of getPopularLocalized(l)) {
        expect(typeof p.title).toBe("string");
        expect(p.title.length).toBeGreaterThan(0);
      }
      for (const t of getTrendingLocalized(l)) {
        expect(typeof t).toBe("string");
      }
      for (const p of getHeroPlaceholders(l)) {
        expect(typeof p).toBe("string");
      }
      for (const t of getHeroTrending(l)) {
        expect(typeof t).toBe("string");
      }
    }
  });
});

describe("Slugs identical across languages + structure is lang-independent", () => {
  it("getVisibleCategoriesLocalized returns the same slugs in EN/FR/ES", () => {
    const en = getVisibleCategoriesLocalized("en").map((c) => c.slug);
    const fr = getVisibleCategoriesLocalized("fr").map((c) => c.slug);
    const es = getVisibleCategoriesLocalized("es").map((c) => c.slug);
    expect(fr).toEqual(en);
    expect(es).toEqual(en);
  });

  it("FAQ group categories are identical across languages", () => {
    const en = getFAQsByCategoryLocalized("payments", "en").map((g) => g.category);
    const fr = getFAQsByCategoryLocalized("payments", "fr").map((g) => g.category);
    expect(fr).toEqual(en);
  });
});

describe("Payments-first — FR/ES do not reintroduce dormant verticals or product claims", () => {
  const DORMANT_EN = ["shipping", "saas", "insurance", "telecom", "energy", "banking", "financing"];
  const PRODUCT_CLAIMS = ["CAMBRA Pro", "Founding period", "Founding membership", "membership plan"];
  const UNAVAILABLE_CONNECTORS = ["Drive", "Sheets", "Gmail", "Slack"];

  it("FR/ES category titles and descriptions contain no dormant vertical or product claim", () => {
    for (const slug of CATEGORY_SLUGS) {
      for (const l of ["fr", "es"]) {
        const title = CATEGORY_CONTENT[slug].title[l].toLowerCase();
        const desc = CATEGORY_CONTENT[slug].description[l].toLowerCase();
        for (const term of [...DORMANT_EN, ...PRODUCT_CLAIMS]) {
          expect(title, `${slug} ${l} title`).not.toContain(term.toLowerCase());
          expect(desc, `${slug} ${l} desc`).not.toContain(term.toLowerCase());
        }
      }
    }
  });

  it("FR/ES 'other cost categories' disclaimer uses generic wording (no dormant vertical named)", () => {
    const gs = getFAQsByCategoryLocalized("getting-started", "fr")[0] || {};
    const frAnswers = (gs.items || []).map((i) => i.a).join(" ");
    const esAnswers = (getFAQsByCategoryLocalized("getting-started", "es")[0]?.items || []).map((i) => i.a).join(" ");
    // FR/ES equivalents of the dormant verticals must not appear in the disclaimer.
    const frTerms = ["livraison", "logistique", "assurance", "télécom", "telecom", "énergie", "financement", "logiciel"];
    const esTerms = ["envíos", "envío", "logística", "seguros", "seguro", "telecom", "energía", "financiación"];
    for (const t of frTerms) expect(frAnswers.toLowerCase()).not.toContain(t);
    for (const t of esTerms) expect(esAnswers.toLowerCase()).not.toContain(t);
  });

  it("no FR/ES FAQ answer contains CAMBRA Pro / Founding / membership plan", () => {
    for (const l of ["fr", "es"]) {
      const all = getAllFAQs(l);
      for (const f of all) {
        for (const term of PRODUCT_CLAIMS) {
          expect(f.a.toLowerCase()).not.toContain(term.toLowerCase());
          expect(f.q.toLowerCase()).not.toContain(term.toLowerCase());
        }
      }
    }
  });

  it("no FR/ES FAQ presents unavailable connectors (Drive/Sheets/Gmail/Slack) as connectable", () => {
    for (const l of ["fr", "es"]) {
      const integrations = getFAQsByCategoryLocalized("integrations", l);
      const text = integrations.map((g) => g.items.map((i) => i.q + " " + i.a).join(" ")).join(" ");
      for (const c of UNAVAILABLE_CONNECTORS) {
        expect(text).not.toContain(c);
      }
    }
  });
});

describe("Retired slugs still redirect (localization did not change redirects)", () => {
  it("retired slugs are recognised and have no localized category", () => {
    for (const s of ["shipping", "saas", "cambra-pro", "founding-period", "insurance", "financing"]) {
      expect(isRetiredHelpSlug(s)).toBe(true);
      for (const l of LANGS) {
        expect(getCategoryLocalized(s, l)).toBeUndefined();
      }
    }
  });

  it("HelpCategory still redirects retired/unknown to /Help", () => {
    const src = readSrc("src/pages/HelpCategory.jsx");
    expect(src).toContain("isRetiredHelpSlug");
    expect(src).toContain('Navigate to="/Help"');
  });
});

describe("SEO unchanged — retired slugs noindex, live indexable, in every language", () => {
  it("live Help category slugs are index,follow in EN/FR/ES", () => {
    for (const s of ["payments", "getting-started", "pricing", "integrations", "uploads", "security"]) {
      for (const l of LANGS) {
        const e = getSeoForPathLang(`/Help/${s}`, l);
        expect(e).toBeTruthy();
        expect(e.robots).toBe(DEFAULT_ROBOTS);
      }
    }
  });

  it("retired slugs are noindex,nofollow in EN/FR/ES", () => {
    for (const s of RETIRED_HELP_SLUGS) {
      for (const l of LANGS) {
        const e = getSeoForPathLang(`/Help/${s}`, l);
        expect(e).toBeTruthy();
        expect(e.robots).toBe(NOINDEX_ROBOTS);
      }
    }
  });

  it("dynamic SEO title remains slug-derived (not the localized category title)", () => {
    const e = getSeoForPathLang("/Help/getting-started", "fr");
    // Slug-derived label "Getting Started" → "Getting Started — Aide CAMBRA"
    expect(e.title.fr).toContain("Getting Started");
    expect(e.title.fr).toContain("Aide CAMBRA");
  });
});

describe("Stripe honest classification — not 'live' until verified", () => {
  it("integrations FAQ classifies Stripe as implemented/pending, not 'live', in all langs", () => {
    const en = getFAQsByCategoryLocalized("integrations", "en").map((g) => g.items.map((i) => i.a).join(" ")).join(" ");
    const fr = getFAQsByCategoryLocalized("integrations", "fr").map((g) => g.items.map((i) => i.a).join(" ")).join(" ");
    const es = getFAQsByCategoryLocalized("integrations", "es").map((g) => g.items.map((i) => i.a).join(" ")).join(" ");

    // Honest classification phrase present per language.
    expect(en).toContain("Implemented — live verification pending");
    expect(fr).toContain("Implémenté — validation en production en attente");
    expect(es).toContain("Implementado — validación en producción pendiente");

    // No unqualified "Stripe is the live" assertion.
    expect(en).not.toContain("Stripe is the live");
    expect(fr).not.toContain("Stripe est la connexion en directe");
    expect(es).not.toContain("Stripe es la conexión en vivo");
  });

  it("OPERATIONS_STATUS.md classifies Stripe as verification-pending, with a manual checklist", () => {
    const doc = readSrc("src/docs/OPERATIONS_STATUS.md");
    expect(doc).toContain("Implemented — live verification pending");
    expect(doc).toContain("live-verification checklist");
    expect(doc).toContain("OAuth start");
    expect(doc).toContain("OAuth callback");
    expect(doc).toContain("Cancel");
    expect(doc).toContain("Disconnect");
    expect(doc).toContain("Tenant isolation");
    expect(doc).toContain("No write scopes");
    // The old flat "Live connections: Stripe" header must be gone.
    expect(doc).not.toContain("Live connections: Stripe");
    // No flat assertion that Stripe is live.
    expect(doc).not.toMatch(/\bStripe is live\b/i);
    // The honest classification bullet must call out the pending state explicitly.
    expect(doc).toMatch(/verification pending|validation en production en attente|validación en producción pendiente/);
  });
});
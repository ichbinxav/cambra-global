import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import process from "node:process";
import {
  FEATURE_SCOPE,
  isProductionEnabled,
  isMerchantVisible,
  getMerchantVisibleVerticals,
  getDormantVerticals,
} from "@/lib/featureScope";
import {
  CATEGORIES,
  FAQ_GROUPS,
  getVisibleCategories,
  getCategory,
  RETIRED_HELP_SLUGS,
  isRetiredHelpSlug,
  getAllFAQs,
} from "@/lib/helpCenterData";
import { getSeoForPathLang, NOINDEX_ROBOTS, DEFAULT_ROBOTS } from "@/lib/seoConfig";
import { safeReturnUrl, isSameOriginUrl } from "@/lib/safeRedirect";

const readSrc = (rel) => readFileSync(join(process.cwd(), rel), "utf-8");

const DORMANT_VERTICALS = ["shipping", "saas", "insurance", "telecom", "energy", "banking", "financing"];

describe("Product scope — featureScope is the single source of truth", () => {
  it("payments is the only merchantVisible vertical", () => {
    expect(getMerchantVisibleVerticals()).toEqual(["payments"]);
  });

  it("payments is the only productionEnabled vertical", () => {
    const enabled = Object.keys(FEATURE_SCOPE).filter(isProductionEnabled);
    expect(enabled).toEqual(["payments"]);
  });

  it("every non-payments vertical is dormant (not visible, not production)", () => {
    for (const v of DORMANT_VERTICALS) {
      expect(isMerchantVisible(v)).toBe(false);
      expect(isProductionEnabled(v)).toBe(false);
    }
  });

  it("dormant list contains all future verticals and not payments", () => {
    const dormant = getDormantVerticals();
    for (const v of DORMANT_VERTICALS) expect(dormant).toContain(v);
    expect(dormant).not.toContain("payments");
  });
});

describe("Help Center — payments-first taxonomy", () => {
  it("no Help category maps to a dormant vertical", () => {
    const slugs = CATEGORIES.map((c) => c.slug);
    for (const v of DORMANT_VERTICALS) {
      expect(slugs).not.toContain(v);
      expect(slugs).not.toContain("logistics");
    }
  });

  it("getVisibleCategories is governed by featureScope and returns only live categories", () => {
    const visible = getVisibleCategories();
    // Every visible category whose vertical is set must be merchantVisible.
    for (const c of visible) {
      if (c.vertical) expect(isMerchantVisible(c.vertical)).toBe(true);
    }
    // No retired/dormant slug appears.
    for (const slug of RETIRED_HELP_SLUGS) {
      expect(visible.find((c) => c.slug === slug)).toBeUndefined();
    }
  });

  it("retired slugs are listed and recognised", () => {
    expect(RETIRED_HELP_SLUGS).toContain("shipping");
    expect(RETIRED_HELP_SLUGS).toContain("saas");
    expect(RETIRED_HELP_SLUGS).toContain("cambra-pro");
    expect(RETIRED_HELP_SLUGS).toContain("founding-period");
    for (const s of ["shipping", "saas", "cambra-pro", "founding-period"]) {
      expect(isRetiredHelpSlug(s)).toBe(true);
    }
    expect(isRetiredHelpSlug("payments")).toBe(false);
  });

  it("getCategory returns undefined for retired slugs (so HelpCategory redirects)", () => {
    for (const s of ["shipping", "saas", "cambra-pro", "founding-period"]) {
      expect(getCategory(s)).toBeUndefined();
    }
    expect(getCategory("payments")).toBeDefined();
  });

  it("no FAQ group belongs to a retired/dormant category", () => {
    const cats = new Set(FAQ_GROUPS.map((g) => g.category));
    for (const s of RETIRED_HELP_SLUGS) expect(cats.has(s)).toBe(false);
  });

  it("searchable FAQs contain no shipping/SaaS/insurance/telecom category", () => {
    const cats = new Set(getAllFAQs().map((f) => f.category));
    for (const v of ["shipping", "saas", "insurance", "telecom", "energy", "banking", "financing"]) {
      expect(cats.has(v)).toBe(false);
    }
  });

  it("integrations description does not list Shopify/Drive/Sheets/Gmail/Slack as connectable", () => {
    const desc = getCategory("integrations").description;
    for (const term of ["Shopify", "Drive", "Sheets", "Gmail", "Slack"]) {
      expect(desc).not.toContain(term);
    }
  });

  it("pricing Help copy has no CAMBRA Pro / Founding period / membership plan claims", () => {
    const pricingFaqs = FAQ_GROUPS.find((g) => g.category === "pricing");
    const text = JSON.stringify(pricingFaqs) + getCategory("pricing").description;
    expect(text).not.toContain("CAMBRA Pro");
    expect(text).not.toContain("Founding period");
    expect(text).not.toContain("Founding membership");
    expect(text).not.toContain("membership plan");
  });

  it("getting-started does not present dormant verticals as active", () => {
    const gs = FAQ_GROUPS.find((g) => g.category === "getting-started");
    const text = JSON.stringify(gs);
    // The only legitimate mention is the explicit "not currently available" FAQ.
    expect(text).toContain("not currently available");
  });
});

describe("SEO — retired Help slugs are noindex, live ones are indexable", () => {
  it("retired slugs resolve to noindex,nofollow", () => {
    for (const s of ["shipping", "saas", "cambra-pro", "founding-period", "insurance", "financing"]) {
      const entry = getSeoForPathLang(`/Help/${s}`, "en");
      expect(entry).toBeTruthy();
      expect(entry.robots).toBe(NOINDEX_ROBOTS);
    }
  });

  it("live Help category slugs resolve to index,follow", () => {
    for (const s of ["payments", "getting-started", "pricing", "integrations", "uploads"]) {
      const entry = getSeoForPathLang(`/Help/${s}`, "en");
      expect(entry).toBeTruthy();
      expect(entry.robots).toBe(DEFAULT_ROBOTS);
    }
  });

  it("seoConfig titles/descriptions do not promise future services as active", () => {
    const blob = readSrc("src/lib/seoConfig.js");
    for (const term of ["shipping", "SaaS", "insurance", "telecom", "energy", "financing", "CAMBRA Pro", "Founding period"]) {
      // Allowed only inside the payments-first scope comment block, not in titles/descriptions.
      // We strip the header comment to avoid false positives from documentation.
      const code = blob.replace(/^\/\/.*$/gm, "");
      expect(code).not.toMatch(new RegExp(`title.*${term}|description.*${term}`, "i"));
    }
  });
});

describe("Public surfaces — no dormant-vertical CTAs or routes", () => {
  it("Navbar public nav has no dormant-vertical links", () => {
    const src = readSrc("src/components/landing/Navbar.jsx");
    const nav = src.match(/NAV_PUBLIC\s*=\s*\[([\s\S]*?)\];/)?.[1] || "";
    for (const v of ["shipping", "Shipping", "saas", "SaaS", "insurance", "telecom", "energy", "banking", "financing"]) {
      expect(nav).not.toContain(v);
    }
  });

  it("Pricing page copy has no CAMBRA Pro / Founding / membership plan", () => {
    const src = readSrc("src/pages/Pricing.jsx") + readSrc("src/components/landing/PricingDual.jsx");
    expect(src).not.toContain("CAMBRA Pro");
    expect(src).not.toContain("Founding period");
    expect(src).not.toContain("Founding membership");
    expect(src).not.toContain("membership plan");
  });

  it("ConnectIntegrations client registry has no Drive/Sheets/Gmail/Slack connectors", () => {
    const src = readSrc("src/pages/ConnectIntegrations.jsx");
    // Connector keys for the four non-payments tools must not be mirrored.
    expect(src).not.toMatch(/^\s*drive:\s*{/m);
    expect(src).not.toMatch(/^\s*sheets:\s*{/m);
    expect(src).not.toMatch(/^\s*gmail:\s*{/m);
    expect(src).not.toMatch(/^\s*slack:\s*{/m);
  });

  it("Onboarding does not import or render Shipping/SaaS modules", () => {
    const src = readSrc("src/pages/Onboarding.jsx");
    expect(src).not.toMatch(/import\s+ShippingModule/);
    expect(src).not.toMatch(/import\s+SaasModule/);
    expect(src).not.toMatch(/<ShippingModule/);
    expect(src).not.toMatch(/<SaasModule/);
  });
});

describe("featureScope is consumed by real surfaces", () => {
  it("helpCenterData imports featureScope", () => {
    const src = readSrc("src/lib/helpCenterData.js");
    expect(src).toContain("from \"@/lib/featureScope\"");
    expect(src).toContain("isMerchantVisible");
  });

  it("CategoryGrid uses getVisibleCategories (featureScope-governed)", () => {
    const src = readSrc("src/components/help/CategoryGrid.jsx");
    expect(src).toContain("getVisibleCategories");
  });

  it("HelpSearch uses getVisibleCategories", () => {
    const src = readSrc("src/components/help/HelpSearch.jsx");
    expect(src).toContain("getVisibleCategories");
  });

  it("HelpCategory redirects retired slugs", () => {
    const src = readSrc("src/pages/HelpCategory.jsx");
    expect(src).toContain("isRetiredHelpSlug");
    expect(src).toContain("Navigate to=\"/Help\"");
  });
});

describe("safeRedirect — regression guard (unchanged by v59)", () => {
  it("rejects protocol-relative URLs", () => {
    expect(safeReturnUrl("//evil.com/Dashboard", "https://app.example.com")).toBe("https://app.example.com/Dashboard");
    expect(safeReturnUrl("///evil.com", "https://app.example.com")).toBe("https://app.example.com/Dashboard");
    expect(safeReturnUrl("/\\evil.com", "https://app.example.com")).toBe("https://app.example.com/Dashboard");
    expect(safeReturnUrl("/%2F%2Fevil.com", "https://app.example.com")).toBe("https://app.example.com/Dashboard");
  });

  it("still accepts valid internal relative paths", () => {
    expect(safeReturnUrl("/Dashboard", "https://app.example.com")).toBe("https://app.example.com/Dashboard");
    expect(safeReturnUrl("/Results?session=abc", "https://app.example.com")).toBe("https://app.example.com/Results?session=abc");
  });

  it("isSameOriginUrl returns null for protocol-relative", () => {
    expect(isSameOriginUrl("//evil.com", "https://app.example.com")).toBeNull();
    expect(isSameOriginUrl("///evil.com", "https://app.example.com")).toBeNull();
  });
});
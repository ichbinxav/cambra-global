// CAMBRA Help Center — structure, behaviour & localized accessors.
// Tone: sharp, intelligent, calm, payments-native.
//
// v59.1 (2026-08-05) — full EN/FR/ES localization.
// ─────────────────────────────────────────────────────────────────────────
// ARCHITECTURE — content separated from structure:
//  - helpCenterContent.js holds ONLY localized strings (HELP_UI,
//    CATEGORY_CONTENT, FAQ_CONTENT, POPULAR_CONTENT, TRENDING_SEARCHES).
//  - This file holds structure (slugs, icons, accents, vertical mapping,
//    RETIRED_HELP_SLUGS, featureScope filtering) and accessor functions that
//    resolve localized content by language with an explicit EN fallback.
//
// LANGUAGE POLICY:
//  - The active language comes from LanguageProvider (useTranslation().lang).
//  - resolve(obj, lang) returns obj[lang] ?? obj.en ?? "" — never undefined,
//    never a raw key, never a rendered object. A missing FR/ES value falls
//    back to English, not to a key string.
//  - For backward compatibility, the legacy EN-derived exports (CATEGORIES
//    with EN title/description, FAQ_GROUPS with EN q/a, POPULAR with EN
//    title, TRENDING_SEARCHES as EN strings, getAllFAQs() EN-flattened) are
//    preserved so existing tests and any non-localized consumer keep working.
//    Components that render to merchants use the *Localized(lang) accessors.
//
// v59 (2026-08-05) — payments-first coherence.
//  - Governed by src/lib/featureScope.js. Only verticals flagged
//    merchantVisible surface as categories. Today that is `payments` alone;
//    shipping, SaaS, insurance, telecom, energy, banking and financing are
//    dormant roadmap and MUST NOT appear as active Help categories.
//  - Retired slugs (shipping, saas, …) are kept in RETIRED_HELP_SLUGS so
//    HelpCategory redirects /Help/<retired-slug> → /Help, SeoMeta emits
//    noindex,nofollow, and they never appear in the grid, search or sitemap.
// ─────────────────────────────────────────────────────────────────────────

import { isMerchantVisible } from "@/lib/featureScope";
import {
  CATEGORY_CONTENT,
  FAQ_CONTENT,
  POPULAR_CONTENT,
  TRENDING_SEARCHES,
  HELP_UI,
} from "@/lib/helpCenterContent";

// ── Structural category definitions (no title/description here — those are
//    localized in helpCenterContent.js and merged by the accessors). ──
const CATEGORY_STRUCTURE = [
  { slug: "getting-started", icon: "Sparkles", accent: "#1F4ED8" },
  { slug: "analyzer", icon: "Activity", accent: "#2CA7C1" },
  { slug: "savings", icon: "TrendingDown", accent: "#2CA7C1" },
  { slug: "payments", icon: "CreditCard", accent: "#635BFF", vertical: "payments" },
  { slug: "benchmarks", icon: "BarChart3", accent: "#1F4ED8" },
  { slug: "integrations", icon: "Plug", accent: "#2CA7C1" },
  { slug: "uploads", icon: "Upload", accent: "#635BFF" },
  { slug: "security", icon: "Shield", accent: "#1F4ED8" },
  { slug: "pricing", icon: "Wallet", accent: "#2CA7C1" },
  { slug: "troubleshooting", icon: "Wrench", accent: "#1F4ED8" },
  { slug: "legal", icon: "Scale", accent: "#2CA7C1" },
];

// Backward-compat: CATEGORIES with EN title/description merged in (so legacy
// tests and consumers that read .title/.description keep working). Merchant
// components use getVisibleCategoriesLocalized(lang) instead.
export const CATEGORIES = CATEGORY_STRUCTURE.map((c) => ({
  ...c,
  title: CATEGORY_CONTENT[c.slug]?.title.en ?? c.slug,
  description: CATEGORY_CONTENT[c.slug]?.description.en ?? "",
}));

// Slugs that belonged to the pre-payments-only multi-vertical product. They are
// NOT in CATEGORIES, so getCategory() returns undefined and HelpCategory
// redirects to /Help. Listed explicitly so SeoMeta can noindex them and tests
// can assert they are retired.
export const RETIRED_HELP_SLUGS = [
  "shipping", "saas", "insurance", "telecom", "energy", "banking", "financing",
  "cambra-pro", "founding-period", "logistics",
];

export function getRetiredHelpSlugs() {
  return RETIRED_HELP_SLUGS.slice();
}

// ── Resolver — the single source of the EN-fallback rule. ──
// Returns a string for any localized {en, fr, es} object. A missing language
// falls back to English; a fully missing value returns "" (never undefined,
// never a rendered object).
export function resolve(localizedObj, lang = "en") {
  if (!localizedObj) return "";
  if (typeof localizedObj === "string") return localizedObj;
  return localizedObj[lang] ?? localizedObj.en ?? "";
}

// Categories visible to merchants, governed by featureScope. A category with a
// `vertical` is shown only when that vertical is merchantVisible. Categories
// without a vertical are vertical-agnostic and always visible.
export function getVisibleCategories() {
  return CATEGORIES.filter((c) => !c.vertical || isMerchantVisible(c.vertical));
}

export function getCategory(slug) {
  return CATEGORIES.find((c) => c.slug === slug);
}

// ── Localized accessors (merchant-facing components use these) ──

export function getCategoryLocalized(slug, lang = "en") {
  const cat = getCategory(slug);
  if (!cat) return undefined;
  const content = CATEGORY_CONTENT[slug];
  return {
    ...cat,
    title: resolve(content?.title, lang),
    description: resolve(content?.description, lang),
  };
}

export function getVisibleCategoriesLocalized(lang = "en") {
  return getVisibleCategories()
    .map((c) => getCategoryLocalized(c.slug, lang))
    .filter(Boolean);
}

// FAQ groups — localized structure + content, resolved by language.
export function getFAQsByCategoryLocalized(slug, lang = "en") {
  return FAQ_CONTENT.filter((g) => g.category === slug).map((g) => ({
    category: g.category,
    title: resolve(g.title, lang),
    items: (g.items || []).map((item) => ({
      q: resolve(item.q, lang),
      a: resolve(item.a, lang),
    })),
  }));
}

// All FAQs flattened for search, resolved in the requested language.
export function getAllFAQs(lang = "en") {
  return FAQ_CONTENT.flatMap((g) =>
    (g.items || []).map((item, idx) => ({
      q: resolve(item.q, lang),
      a: resolve(item.a, lang),
      category: g.category,
      groupTitle: resolve(g.title, lang),
      id: `${g.category}-${idx}`,
    }))
  );
}

export function getPopularLocalized(lang = "en") {
  return POPULAR_CONTENT.map((p) => ({
    ...p,
    title: resolve(p.title, lang),
  }));
}

export function getTrendingLocalized(lang = "en") {
  return TRENDING_SEARCHES.map((t) => resolve(t, lang));
}

// UI string accessor for component chrome (placeholders, headers, CTAs, …).
export function helpUi(lang = "en", key) {
  const entry = HELP_UI[key];
  return resolve(entry, lang);
}

// Rotating search placeholders + hero trending chips, resolved by language.
export function getHeroPlaceholders(lang = "en") {
  return (HELP_UI.heroPlaceholders || []).map((p) => resolve(p, lang));
}

export function getHeroTrending(lang = "en") {
  return (HELP_UI.heroTrending || []).map((t) => resolve(t, lang));
}

// ── Backward-compat EN-derived exports ──
// FAQ_GROUPS mirrors FAQ_CONTENT with EN-resolved q/a, so existing tests that
// JSON.stringify a group still see the EN text (e.g. the "not currently
// available" disclaimer).
export const FAQ_GROUPS = FAQ_CONTENT.map((g) => ({
  category: g.category,
  title: resolve(g.title, "en"),
  items: (g.items || []).map((item) => ({
    q: resolve(item.q, "en"),
    a: resolve(item.a, "en"),
  })),
}));

export const POPULAR = POPULAR_CONTENT.map((p) => ({
  slug: p.slug,
  category: p.category,
  read: p.read,
  title: resolve(p.title, "en"),
}));

export { TRENDING_SEARCHES };
// Backward-compat alias: some consumers expect an array of plain EN strings
// (the original shape). Keep the localized objects above as the canonical
// export and expose EN strings here for legacy readers.
export const TRENDING_SEARCHES_EN = TRENDING_SEARCHES.map((t) => resolve(t, "en"));

export function getFAQsByCategory(slug) {
  return FAQ_GROUPS.filter((g) => g.category === slug);
}

export function isRetiredHelpSlug(slug) {
  return RETIRED_HELP_SLUGS.includes(slug);
}
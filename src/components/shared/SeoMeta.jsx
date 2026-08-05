import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "@/lib/i18n.jsx";
import {
  SEO_ORIGIN,
  DEFAULT_OG_IMAGE,
  DEFAULT_ROBOTS,
  NOINDEX_ROBOTS,
  OG_LOCALE,
  getSeoForPathLang,
  buildCanonicalUrl,
  webPageSchema,
} from "@/lib/seoConfig.js";

// SEO-1 (2026-08-05) — Centralized per-route SEO writer.
//
// This is the ONLY component that writes route metadata. It owns:
//   document.title, meta description, Open Graph (title/description/type/url/
//   image/locale), Twitter (card/title/description/image), canonical link,
//   robots meta, and the per-route JSON-LD script (id = "cambra-route-jsonld").
//
// The language switcher (LanguageProvider) keeps only <html lang>; it no
// longer writes meta tags, so the two systems never race.
//
// Resolution:
//   1. Exact match in SEO_STATIC (e.g. "/Partners").
//   2. Dynamic match in SEO_DYNAMIC (e.g. "/Help/payments").
//   3. Anything else → noindex,nofollow and no route schema (safe default).
//
// SPA LIMITATION (see OPERATIONS_STATUS.md): Base44/Vite serves a single
// index.html with no per-route server render, so scrapers that do not execute
// JavaScript (some social previews) see the homepage meta for every URL.
// This component fixes the index for crawlers that DO run JS (Googlebot) and
// for the in-app experience; per-route social previews require platform-level
// prerender or SSR, documented as a manual step.

const JSONLD_ID = "cambra-route-jsonld";

// Upsert a meta element selected by an attribute query. Never creates duplicates:
// it reuses the existing element when present.
function upsertMeta(selector, createAttrs) {
  let el = document.querySelector(selector);
  if (!el) {
    el = document.createElement("meta");
    for (const [k, v] of Object.entries(createAttrs)) el.setAttribute(k, v);
    document.head.appendChild(el);
  }
  return el;
}

function upsertLink(rel) {
  let el = document.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  return el;
}

function setJsonLd(schema) {
  const existing = document.getElementById(JSONLD_ID);
  // Homepage: index.html already carries the authoritative Service JSON-LD.
  // Remove any dynamic block so the homepage never serves two schemas.
  if (!schema) {
    if (existing) existing.remove();
    return;
  }
  let script = existing;
  if (!script) {
    script = document.createElement("script");
    script.id = JSONLD_ID;
    script.type = "application/ld+json";
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(schema);
}

export default function SeoMeta() {
  const location = useLocation();
  const { lang } = useTranslation();

  useEffect(() => {
    // Ignore query strings and hashes for canonical/og:url.
    const pathname = location.pathname || "/";

    // i18n owns <html lang>; mirror it here too so head stays consistent
    // immediately on route change (idempotent).
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang || "en";
    }

    const entry = getSeoForPathLang(pathname, lang);
    const isPublic = Boolean(entry);
    const robots = isPublic ? entry.robots || DEFAULT_ROBOTS : NOINDEX_ROBOTS;
    const canonicalPath = isPublic ? entry.canonicalPath : pathname;
    const canonical = buildCanonicalUrl(canonicalPath);

    const title = isPublic ? entry.title[lang] || entry.title.en : "CAMBRA";
    const description = isPublic
      ? entry.description[lang] || entry.description.en
      : "CAMBRA — card payment cost audit for independent brands.";
    const ogType = isPublic ? entry.ogType || "website" : "website";
    const ogImage = DEFAULT_OG_IMAGE;
    const ogLocale = OG_LOCALE[lang] || OG_LOCALE.en;

    // <title>
    document.title = title;

    // meta description
    upsertMeta('meta[name="description"]', { name: "description" }).setAttribute("content", description);

    // Open Graph
    upsertMeta('meta[property="og:title"]', { property: "og:title" }).setAttribute("content", title);
    upsertMeta('meta[property="og:description"]', { property: "og:description" }).setAttribute("content", description);
    upsertMeta('meta[property="og:type"]', { property: "og:type" }).setAttribute("content", ogType);
    upsertMeta('meta[property="og:url"]', { property: "og:url" }).setAttribute("content", canonical);
    upsertMeta('meta[property="og:image"]', { property: "og:image" }).setAttribute("content", ogImage);
    upsertMeta('meta[property="og:site_name"]', { property: "og:site_name" }).setAttribute("content", "CAMBRA");
    upsertMeta('meta[property="og:locale"]', { property: "og:locale" }).setAttribute("content", ogLocale);

    // Twitter
    upsertMeta('meta[name="twitter:card"]', { name: "twitter:card" }).setAttribute("content", "summary_large_image");
    upsertMeta('meta[name="twitter:title"]', { name: "twitter:title" }).setAttribute("content", title);
    upsertMeta('meta[name="twitter:description"]', { name: "twitter:description" }).setAttribute("content", description);
    upsertMeta('meta[name="twitter:image"]', { name: "twitter:image" }).setAttribute("content", ogImage);

    // Canonical
    upsertLink("canonical").setAttribute("href", canonical);

    // Robots — single decision point (replaces the old RobotsMeta allowlist).
    upsertMeta('meta[name="robots"]', { name: "robots" }).setAttribute("content", robots);

    // JSON-LD — homepage keeps the static index.html Service schema; every
    // other public route gets a WebPage block. Non-public routes get none.
    let schema = null;
    if (isPublic && canonicalPath !== "/") {
      schema = webPageSchema({ title, description, canonical, lang });
    }
    setJsonLd(schema);
  }, [location.pathname, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

export { SEO_ORIGIN };
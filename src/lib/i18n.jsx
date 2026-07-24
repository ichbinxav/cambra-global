import { useState, useEffect, createContext, useContext, useCallback, useMemo } from "react";
// SWEEP-1 T3 (2026-07-24): dictionaries split into per-language files.
// Parity verified programmatically at extraction: 537/537 keys per language,
// zero value diffs (+2 new SWEEP-1 T2 keys). API of this module is unchanged.
import en from "@/lib/locales/en";
import fr from "@/lib/locales/fr";
import es from "@/lib/locales/es";

/* ──────────────────────────────────────────────────────────────
   CAMBRA i18n — EN / FR / ES with flat-key dictionaries.

   API:
     const { lang, setLang, t, formatCurrency, formatDate } = useTranslation();
     t("hero_headline")                         → string
     t("benchmarked_against", { n: 42 })        → replaces {n}
     t(obj, "en")  // legacy 2-arg form for older components
   ────────────────────────────────────────────────────────────── */

export const LANGUAGES = [
  { code: "en", label: "English", short: "EN" },
  { code: "fr", label: "Français", short: "FR" },
  { code: "es", label: "Español", short: "ES" },
];

const STORAGE_KEY = "cambra_lang";
const LEGACY_KEYS = ["node_lang"];

/* ── locale helpers ───────────────────────────────────────── */
const CURRENCY_LOCALES = { en: "en-IE", fr: "fr-FR", es: "es-ES" };
const DATE_LOCALES     = { en: "en-GB", fr: "fr-FR", es: "es-ES" };

export function formatCurrency(amount, lang = "en") {
  const locale = CURRENCY_LOCALES[lang] || CURRENCY_LOCALES.en;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(Number(amount) || 0);
  } catch {
    return `€${Math.round(Number(amount) || 0).toLocaleString()}`;
  }
}

export function formatDate(date, lang = "en") {
  if (!date) return "";
  const locale = DATE_LOCALES[lang] || DATE_LOCALES.en;
  try {
    return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(new Date(date));
  } catch {
    return String(date);
  }
}

/* ── dictionaries (flat keys) — see src/lib/locales/{en,fr,es}.js ── */
const DICT = { en, fr, es };

/* ── Legacy nested-object translations (kept for older landing components) ── */
export const translations = {
  /* legacy passthrough — older components import { translations, t } from i18n
     and call t(translations.xxx, lang). Empty object short-circuits via fallback. */
};

/* ── interpolation ────────────────────────────────────────── */
function interpolate(str, params) {
  if (!params || typeof str !== "string") return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (params[k] !== undefined ? String(params[k]) : `{${k}}`));
}

/* ── Context ──────────────────────────────────────────────── */
const LanguageContext = createContext({
  lang: "en",
  setLang: () => {},
  t: (k) => k,
  formatCurrency: (n) => formatCurrency(n, "en"),
  formatDate: (d) => formatDate(d, "en"),
});

function readStoredLang() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && DICT[v]) return v;
    for (const legacy of LEGACY_KEYS) {
      const lv = localStorage.getItem(legacy);
      if (lv && DICT[lv]) return lv;
    }
  } catch {}
  return "en";
}

// Ensure a meta tag exists; create it if missing. Returns the element.
function ensureMeta(selector, attrs) {
  let el = document.querySelector(selector);
  if (!el) {
    el = document.createElement("meta");
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.head.appendChild(el);
  }
  return el;
}

function updateMetaTags(lang) {
  try {
    const dict = DICT[lang] || DICT.en;
    const title = dict.meta_title;
    const description = dict.meta_description;

    // <html lang>
    document.documentElement.lang = lang;

    // <title>
    if (title) document.title = title;

    // Standard description
    if (description) {
      ensureMeta('meta[name="description"]', { name: "description" })
        .setAttribute("content", description);
    }

    // Open Graph
    if (title) {
      ensureMeta('meta[property="og:title"]', { property: "og:title" })
        .setAttribute("content", title);
    }
    if (description) {
      ensureMeta('meta[property="og:description"]', { property: "og:description" })
        .setAttribute("content", description);
    }
    ensureMeta('meta[property="og:locale"]', { property: "og:locale" })
      .setAttribute("content", { en: "en_GB", fr: "fr_FR", es: "es_ES" }[lang] || "en_GB");

    // Twitter
    if (title) {
      ensureMeta('meta[name="twitter:title"]', { name: "twitter:title" })
        .setAttribute("content", title);
    }
    if (description) {
      ensureMeta('meta[name="twitter:description"]', { name: "twitter:description" })
        .setAttribute("content", description);
    }
  } catch {}
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => readStoredLang());

  const setLang = useCallback((next) => {
    if (!DICT[next]) return;
    setLangState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch {}
    updateMetaTags(next);
  }, []);

  useEffect(() => {
    updateMetaTags(lang);
  }, [lang]);

  /* dual-mode t():
     - t("key", { params })                  → flat lookup with interpolation
     - t(obj, "en")                          → legacy nested-object lookup */
  const t = useCallback((keyOrObj, paramsOrLang) => {
    if (keyOrObj && typeof keyOrObj === "object") {
      const requested = (typeof paramsOrLang === "string" && DICT[paramsOrLang]) ? paramsOrLang : lang;
      return keyOrObj?.[requested] ?? keyOrObj?.en ?? "";
    }
    const key = String(keyOrObj);
    const dict = DICT[lang] || DICT.en;
    const raw = dict[key] ?? DICT.en[key] ?? key;
    return interpolate(raw, typeof paramsOrLang === "object" ? paramsOrLang : null);
  }, [lang]);

  const value = useMemo(() => ({
    lang,
    setLang,
    t,
    formatCurrency: (n) => formatCurrency(n, lang),
    formatDate:     (d) => formatDate(d, lang),
  }), [lang, setLang, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage()    { return useContext(LanguageContext); }
export function useTranslation() { return useContext(LanguageContext); }

/* Standalone t() for non-React callers (rare): falls back to English only. */
export function t(keyOrObj, paramsOrLang) {
  if (keyOrObj && typeof keyOrObj === "object") {
    const requested = (typeof paramsOrLang === "string" && DICT[paramsOrLang]) ? paramsOrLang : "en";
    return keyOrObj?.[requested] ?? keyOrObj?.en ?? "";
  }
  const key  = String(keyOrObj);
  const raw  = DICT.en[key] ?? key;
  return interpolate(raw, typeof paramsOrLang === "object" ? paramsOrLang : null);
}
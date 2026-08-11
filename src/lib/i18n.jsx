import React, { useState, useEffect, createContext, useContext, useCallback, useMemo } from "react";
// SWEEP-1 T3 (2026-07-24): dictionaries split into per-language files.
// Parity verified programmatically at extraction: 537/537 keys per language,
// zero value diffs (+2 new SWEEP-1 T2 keys). API of this module is unchanged.
import en from "@/lib/locales/en";
import fr from "@/lib/locales/fr";
import es from "@/lib/locales/es";
import { formatMoneyMajor, localeForLanguage } from "../../base44/shared/localeRuntime";

/* ──────────────────────────────────────────────────────────────
   CAMBRA i18n — EN / FR / ES with flat-key dictionaries.

   API:
     const { lang, setLang, t, formatCurrency, formatDate } = useTranslation();
     t("hero_headline")                         → string
     t("benchmarked_against", { n: 42 })        → replaces {n}
     t(obj, "en")  // legacy 2-arg form for older components
   ────────────────────────────────────────────────────────────── */

export const LANGUAGES = [
  { code: "en", locale: "en-GB", label: "English", short: "EN" },
  { code: "fr", locale: "fr-FR", label: "Français", short: "FR" },
  { code: "es", locale: "es-ES", label: "Español", short: "ES" },
];

const STORAGE_KEY = "cambra_lang";
const LEGACY_KEYS = ["node_lang"];

/* ── locale helpers ───────────────────────────────────────── */
const CURRENCY_LOCALES = { en: "en-IE", fr: "fr-FR", es: "es-ES" };
const DATE_LOCALES     = { en: "en-GB", fr: "fr-FR", es: "es-ES" };

export function formatCurrency(amount, lang = "en", currency = "EUR") {
  const locale = CURRENCY_LOCALES[lang] || localeForLanguage(lang);
  try {
    return formatMoneyMajor(Number(amount) || 0, { locale, currency, maximumFractionDigits: 0 });
  } catch {
    return new Intl.NumberFormat(locale).format(Math.round(Number(amount) || 0));
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
/**
 * @typedef {{
 *   lang: string,
 *   locale: string,
 *   detectedLang: string,
 *   isAutomatic: boolean,
 *   setLang: (next: string) => void,
 *   setAutoLang: () => void,
 *   t: (keyOrObj: any, paramsOrLang?: any) => any,
 *   formatCurrency: (amount: any) => string,
 *   formatDate: (date: any) => string,
 * }} TranslationContextValue
 */
const LanguageContext = createContext(/** @type {TranslationContextValue} */ ({
  lang: "en",
  locale: "en-GB",
  detectedLang: "en",
  isAutomatic: true,
  setLang: (_next) => {},
  setAutoLang: () => {},
  t: (keyOrObj, _paramsOrLang) => keyOrObj,
  formatCurrency: (n) => formatCurrency(n, "en"),
  formatDate: (d) => formatDate(d, "en"),
}));

// UX-1 T0 — auto-detection. An explicit choice (stored) always wins; first
// visit falls back to the browser's preferred languages (the best available
// country/locale signal client-side — no geo-IP call needed). Supported:
// fr/es → those; anything else → en. The detected language is NOT persisted,
// so the switcher stays authoritative: only a manual pick writes storage.
export function detectBrowserLang() {
  try {
    const candidates = Array.isArray(navigator.languages) && navigator.languages.length
      ? navigator.languages
      : [navigator.language];
    for (const raw of candidates) {
      const code = String(raw || "").slice(0, 2).toLowerCase();
      if (DICT[code]) return code;
    }
  } catch {}
  return "en";
}

function hasStoredLang() {
  try {
    if (localStorage.getItem(STORAGE_KEY)) return true;
    return LEGACY_KEYS.some((key) => localStorage.getItem(key));
  } catch { return false; }
}

function readStoredLang() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && DICT[v]) return v;
    for (const legacy of LEGACY_KEYS) {
      const lv = localStorage.getItem(legacy);
      if (lv && DICT[lv]) return lv;
    }
  } catch {}
  return detectBrowserLang();
}

// SEO-1 (2026-08-05) — i18n no longer writes route meta tags. The centralized
// SeoMeta component (src/components/shared/SeoMeta.jsx) owns document.title,
// description, Open Graph, Twitter, canonical, robots and JSON-LD per route,
// re-rendering on language AND location change. i18n keeps only the <html lang>
// attribute, which is a language concern (not a route concern) and must not
// race with SeoMeta. See src/lib/seoConfig.js for the per-route source of truth.
function updateMetaTags(lang) {
  try {
    document.documentElement.lang = lang;
  } catch {}
}

export function LanguageProvider({ children }) {
  const [detectedLang, setDetectedLang] = useState(() => detectBrowserLang());
  const [lang, setLangState] = useState(() => readStoredLang());
  const [isAutomatic, setIsAutomatic] = useState(() => !hasStoredLang());

  const setLang = useCallback((next) => {
    if (!DICT[next]) return;
    setLangState(next);
    setIsAutomatic(false);
    try { localStorage.setItem(STORAGE_KEY, next); } catch {}
    updateMetaTags(next);
  }, []);

  const setAutoLang = useCallback(() => {
    const detected = detectBrowserLang();
    setDetectedLang(detected);
    setLangState(detected);
    setIsAutomatic(true);
    try {
      localStorage.removeItem(STORAGE_KEY);
      for (const key of LEGACY_KEYS) localStorage.removeItem(key);
    } catch {}
    updateMetaTags(detected);
  }, []);

  useEffect(() => {
    const syncDetectedLanguage = () => {
      const detected = detectBrowserLang();
      setDetectedLang(detected);
      if (isAutomatic) setLangState(detected);
    };
    window.addEventListener?.("languagechange", syncDetectedLanguage);
    return () => window.removeEventListener?.("languagechange", syncDetectedLanguage);
  }, [isAutomatic]);

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
    locale: localeForLanguage(lang),
    detectedLang,
    isAutomatic,
    setLang,
    setAutoLang,
    t,
    formatCurrency: (n) => formatCurrency(n, lang),
    formatDate:     (d) => formatDate(d, lang),
  }), [lang, detectedLang, isAutomatic, setLang, setAutoLang, t]);

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

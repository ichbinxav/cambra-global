import React, { useState, useEffect, createContext, useContext, useCallback, useMemo, useRef } from "react";
import {
  EN_DICTIONARY,
  getCachedLanguageDictionary,
  isSupportedLanguage,
  loadLanguageDictionary,
} from "@/lib/localeLoader.js";
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
  { code: "de", locale: "de-DE", label: "Deutsch", short: "DE" },
  { code: "it", locale: "it-IT", label: "Italiano", short: "IT" },
  { code: "pl", locale: "pl-PL", label: "Polski", short: "PL" },
  { code: "pt", locale: "pt-PT", label: "Português", short: "PT" },
  { code: "el", locale: "el-GR", label: "Ελληνικά", short: "EL" },
  { code: "sv", locale: "sv-SE", label: "Svenska", short: "SV" },
  { code: "da", locale: "da-DK", label: "Dansk", short: "DA" },
  { code: "fi", locale: "fi-FI", label: "Suomi", short: "FI" },
  { code: "cs", locale: "cs-CZ", label: "Čeština", short: "CS" },
  { code: "ro", locale: "ro-RO", label: "Română", short: "RO" },
  { code: "hu", locale: "hu-HU", label: "Magyar", short: "HU" },
  { code: "bg", locale: "bg-BG", label: "Български", short: "BG" },
  { code: "hr", locale: "hr-HR", label: "Hrvatski", short: "HR" },
  { code: "et", locale: "et-EE", label: "Eesti", short: "ET" },
  { code: "lv", locale: "lv-LV", label: "Latviešu", short: "LV" },
  { code: "lt", locale: "lt-LT", label: "Lietuvių", short: "LT" },
  { code: "sk", locale: "sk-SK", label: "Slovenčina", short: "SK" },
  { code: "sl", locale: "sl-SI", label: "Slovenščina", short: "SL" },
  { code: "nb", locale: "nb-NO", label: "Norsk", short: "NB" },
  { code: "is", locale: "is-IS", label: "Íslenska", short: "IS" },
];

const STORAGE_KEY = "cambra_lang";
const LEGACY_KEYS = ["node_lang"];

/* ── locale helpers ───────────────────────────────────────── */
const CURRENCY_LOCALES = { en: "en-IE", fr: "fr-FR", es: "es-ES", de: "de-DE", it: "it-IT", pl: "pl-PL", pt: "pt-PT", el: "el-GR", sv: "sv-SE", da: "da-DK", fi: "fi-FI", cs: "cs-CZ", ro: "ro-RO", hu: "hu-HU", bg: "bg-BG", hr: "hr-HR", et: "et-EE", lv: "lv-LV", lt: "lt-LT", sk: "sk-SK", sl: "sl-SI", nb: "nb-NO", is: "is-IS" };
const DATE_LOCALES     = { en: "en-GB", fr: "fr-FR", es: "es-ES", de: "de-DE", it: "it-IT", pl: "pl-PL", pt: "pt-PT", el: "el-GR", sv: "sv-SE", da: "da-DK", fi: "fi-FI", cs: "cs-CZ", ro: "ro-RO", hu: "hu-HU", bg: "bg-BG", hr: "hr-HR", et: "et-EE", lv: "lv-LV", lt: "lt-LT", sk: "sk-SK", sl: "sl-SI", nb: "nb-NO", is: "is-IS" };

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
 *   formatCurrency: (amount: any, currency?: string) => string,
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
      if (isSupportedLanguage(code)) return code;
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
    if (v && isSupportedLanguage(v)) return v.toLowerCase();
    for (const legacy of LEGACY_KEYS) {
      const lv = localStorage.getItem(legacy);
      if (lv && isSupportedLanguage(lv)) return lv.toLowerCase();
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

function currentLanguagePreference() {
  const detectedLang = detectBrowserLang();
  return {
    detectedLang,
    isAutomatic: !hasStoredLang(),
    requestedLang: readStoredLang(),
  };
}

// main.jsx awaits this before mounting React. The existing static landing
// markup therefore stays visible while one small language chunk is fetched,
// and the first React frame is already in the correct language.
export async function preloadInitialLanguage({ dictionaryLoader = loadLanguageDictionary } = {}) {
  const preference = currentLanguagePreference();
  try {
    const dictionary = await dictionaryLoader(preference.requestedLang);
    return {
      lang: preference.requestedLang,
      dictionaryLanguage: preference.requestedLang,
      dictionary,
      detectedLang: preference.detectedLang,
      isAutomatic: preference.isAutomatic,
    };
  } catch {
    return {
      lang: "en",
      dictionaryLanguage: "en",
      dictionary: EN_DICTIONARY,
      detectedLang: preference.detectedLang,
      isAutomatic: preference.isAutomatic,
    };
  }
}

function providerInitialState(initialLanguageState) {
  if (
    initialLanguageState
    && isSupportedLanguage(initialLanguageState.lang)
    && initialLanguageState.dictionary
    && typeof initialLanguageState.dictionary === "object"
  ) {
    return {
      lang: initialLanguageState.lang,
      dictionaryLanguage: initialLanguageState.dictionaryLanguage || initialLanguageState.lang,
      dictionary: initialLanguageState.dictionary,
      detectedLang: isSupportedLanguage(initialLanguageState.detectedLang)
        ? initialLanguageState.detectedLang
        : initialLanguageState.lang,
      isAutomatic: Boolean(initialLanguageState.isAutomatic),
    };
  }

  // Direct consumers (tests and isolated component renders) still work without
  // the application bootstrap. They render with the eager English fallback and
  // replace it atomically as soon as the preferred chunk resolves.
  const preference = currentLanguagePreference();
  const cached = getCachedLanguageDictionary(preference.requestedLang);
  return {
    lang: preference.requestedLang,
    dictionaryLanguage: cached ? preference.requestedLang : "en",
    dictionary: cached || EN_DICTIONARY,
    detectedLang: preference.detectedLang,
    isAutomatic: preference.isAutomatic,
  };
}

export function LanguageProvider({
  children,
  initialLanguageState = null,
  dictionaryLoader = loadLanguageDictionary,
}) {
  const initial = useMemo(() => providerInitialState(initialLanguageState), [initialLanguageState]);
  const [detectedLang, setDetectedLang] = useState(initial.detectedLang);
  const [lang, setLangState] = useState(initial.lang);
  const [isAutomatic, setIsAutomatic] = useState(initial.isAutomatic);
  const [dictionaryState, setDictionaryState] = useState({
    lang: initial.dictionaryLanguage,
    dictionary: initial.dictionary,
  });
  const latestLanguageRequest = useRef(0);

  useEffect(() => () => {
    latestLanguageRequest.current += 1;
  }, []);

  const activateLanguage = useCallback(async (next, options = {}) => {
    const normalized = String(next || "").toLowerCase();
    if (!isSupportedLanguage(normalized)) return false;
    const requestId = ++latestLanguageRequest.current;

    try {
      const dictionary = await dictionaryLoader(normalized);
      // A slower, older request must never overwrite the user's latest choice.
      if (requestId !== latestLanguageRequest.current) return false;

      setDictionaryState({ lang: normalized, dictionary });
      setLangState(normalized);
      setIsAutomatic(Boolean(options.automatic));
      try {
        if (options.persistence === "store") {
          localStorage.setItem(STORAGE_KEY, normalized);
        } else if (options.persistence === "clear") {
          localStorage.removeItem(STORAGE_KEY);
          for (const key of LEGACY_KEYS) localStorage.removeItem(key);
        }
      } catch {}
      updateMetaTags(normalized);
      return true;
    } catch {
      if (requestId !== latestLanguageRequest.current) return false;
      // Initial isolated renders cannot keep a non-English lang attribute over
      // English fallback copy. Normal user-initiated failures keep the current
      // fully-loaded language and do not persist a broken preference.
      if (options.fallbackToEnglish) {
        setDictionaryState({ lang: "en", dictionary: EN_DICTIONARY });
        setLangState("en");
        updateMetaTags("en");
      }
      return false;
    }
  }, [dictionaryLoader]);

  const setLang = useCallback((next) => (
    activateLanguage(next, { automatic: false, persistence: "store" })
  ), [activateLanguage]);

  const setAutoLang = useCallback(() => {
    const detected = detectBrowserLang();
    setDetectedLang(detected);
    return activateLanguage(detected, { automatic: true, persistence: "clear" });
  }, [activateLanguage]);

  useEffect(() => {
    if (dictionaryState.lang === lang) return undefined;
    void activateLanguage(lang, {
      automatic: isAutomatic,
      persistence: "preserve",
      fallbackToEnglish: true,
    });
    return undefined;
  }, [activateLanguage, dictionaryState.lang, isAutomatic, lang]);

  useEffect(() => {
    const syncDetectedLanguage = () => {
      const detected = detectBrowserLang();
      setDetectedLang(detected);
      if (isAutomatic) {
        void activateLanguage(detected, { automatic: true, persistence: "preserve" });
      }
    };
    window.addEventListener?.("languagechange", syncDetectedLanguage);
    return () => window.removeEventListener?.("languagechange", syncDetectedLanguage);
  }, [activateLanguage, isAutomatic]);

  useEffect(() => {
    updateMetaTags(lang);
  }, [lang]);

  /* dual-mode t():
     - t("key", { params })                  → flat lookup with interpolation
     - t(obj, "en")                          → legacy nested-object lookup */
  const t = useCallback((keyOrObj, paramsOrLang) => {
    if (keyOrObj && typeof keyOrObj === "object") {
      const requested = (typeof paramsOrLang === "string" && isSupportedLanguage(paramsOrLang)) ? paramsOrLang : lang;
      return keyOrObj?.[requested] ?? keyOrObj?.en ?? "";
    }
    const key = String(keyOrObj);
    const dict = dictionaryState.lang === lang ? dictionaryState.dictionary : EN_DICTIONARY;
    const raw = dict[key] ?? EN_DICTIONARY[key] ?? key;
    return interpolate(raw, typeof paramsOrLang === "object" ? paramsOrLang : null);
  }, [dictionaryState, lang]);

  const value = useMemo(() => ({
    lang,
    locale: localeForLanguage(lang),
    detectedLang,
    isAutomatic,
    setLang,
    setAutoLang,
    t,
    formatCurrency: (n, currency = "EUR") => formatCurrency(n, lang, currency),
    formatDate:     (d) => formatDate(d, lang),
  }), [lang, detectedLang, isAutomatic, setLang, setAutoLang, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage()    { return useContext(LanguageContext); }
export function useTranslation() { return useContext(LanguageContext); }

/* Standalone t() for non-React callers (rare): falls back to English only. */
export function t(keyOrObj, paramsOrLang) {
  if (keyOrObj && typeof keyOrObj === "object") {
    const requested = (typeof paramsOrLang === "string" && isSupportedLanguage(paramsOrLang)) ? paramsOrLang : "en";
    return keyOrObj?.[requested] ?? keyOrObj?.en ?? "";
  }
  const key  = String(keyOrObj);
  const raw  = EN_DICTIONARY[key] ?? key;
  return interpolate(raw, typeof paramsOrLang === "object" ? paramsOrLang : null);
}

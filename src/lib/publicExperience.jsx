import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { EUROPE_MARKETS, EUROPE_MARKET_BY_ISO2, EUROPE_MARKET_CODES } from "@/lib/generated/europeMarkets";
import { LOCALE_MARKET_BY_CODE } from "@/lib/generated/localeRegistry";

const STORAGE_KEY = "cambra_market";
const ANALYZER_ENABLED_MARKETS = Object.freeze(["FR", "ES"]);

function isKnownMarket(value) {
  return typeof value === "string" && EUROPE_MARKET_CODES.includes(value.toUpperCase());
}

export function detectBrowserMarket() {
  try {
    const candidates = Array.isArray(navigator.languages) && navigator.languages.length
      ? navigator.languages
      : [navigator.language];
    for (const candidate of candidates) {
      const parts = String(candidate || "").split("-");
      const region = parts.length > 1 ? parts.at(-1).toUpperCase() : "";
      if (isKnownMarket(region)) return region;
    }

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const timezoneMatches = EUROPE_MARKETS.filter((market) => market.timezones.includes(timezone));
    if (timezoneMatches.length === 1) return timezoneMatches[0].iso2;
  } catch {}
  return "GB";
}

function readStoredMarket() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (isKnownMarket(value)) return value.toUpperCase();
  } catch {}
  return null;
}

export function resolvePublicExperience(marketCode) {
  const code = isKnownMarket(marketCode) ? marketCode.toUpperCase() : "GB";
  const market = EUROPE_MARKET_BY_ISO2[code];
  const locale = LOCALE_MARKET_BY_CODE[code];
  const analyzerEnabled = ANALYZER_ENABLED_MARKETS.includes(code);

  return Object.freeze({
    marketCode: code,
    market,
    currency: market.primary_currency,
    locale,
    landing: Object.freeze({ status: "AVAILABLE", reason: "INFORMATIONAL_SURFACE" }),
    analyzer: Object.freeze({
      status: analyzerEnabled ? "ENABLED" : "LIMITED",
      href: analyzerEnabled
        ? `/Analyzer?market=${encodeURIComponent(code)}`
        : `/Contact?market=${encodeURIComponent(code)}&intent=market-access`,
      reason: analyzerEnabled ? "MARKET_POLICY_ENABLED" : "MARKET_EVIDENCE_REVIEW_REQUIRED",
    }),
    recovery: Object.freeze({ status: "REVIEW_REQUIRED", reason: "CASE_AND_LEGAL_REVIEW_REQUIRED" }),
    legal: Object.freeze({
      status: locale.legal_applicability_status,
      translationStatus: locale.legal_translation_status,
    }),
    translation: Object.freeze({
      status: locale.translation_readiness,
      defaultLocale: locale.default_locale,
      fallbackLocale: locale.fallback_locale,
      supportedLocales: Object.freeze([...locale.supported_product_locales]),
    }),
  });
}

export function marketDisplayName(code, locale = "en-GB") {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) || EUROPE_MARKET_BY_ISO2[code]?.canonical_name || code;
  } catch {
    return EUROPE_MARKET_BY_ISO2[code]?.canonical_name || code;
  }
}

const MarketContext = createContext(null);

export function MarketProvider({ children }) {
  const stored = readStoredMarket();
  const [detectedMarket, setDetectedMarket] = useState(() => detectBrowserMarket());
  const [marketCode, setMarketCode] = useState(() => stored || detectBrowserMarket());
  const [isAutomatic, setIsAutomatic] = useState(() => !stored);

  const setMarket = useCallback((next) => {
    if (!isKnownMarket(next)) return;
    const code = next.toUpperCase();
    setMarketCode(code);
    setIsAutomatic(false);
    try { localStorage.setItem(STORAGE_KEY, code); } catch {}
  }, []);

  const setAutoMarket = useCallback(() => {
    const detected = detectBrowserMarket();
    setDetectedMarket(detected);
    setMarketCode(detected);
    setIsAutomatic(true);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }, []);

  const experience = useMemo(() => resolvePublicExperience(marketCode), [marketCode]);
  const value = useMemo(() => ({
    marketCode,
    detectedMarket,
    isAutomatic,
    setMarket,
    setAutoMarket,
    experience,
  }), [marketCode, detectedMarket, isAutomatic, setMarket, setAutoMarket, experience]);

  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>;
}

export function useMarket() {
  const context = useContext(MarketContext);
  if (!context) throw new Error("useMarket must be used inside MarketProvider");
  return context;
}

export { ANALYZER_ENABLED_MARKETS, EUROPE_MARKETS };

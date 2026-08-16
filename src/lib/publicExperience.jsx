import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  ACTIVE_LAUNCH_MARKETS,
  EUROPE_MARKETS,
  EUROPE_MARKET_BY_ISO2,
  EUROPE_MARKET_CODES,
  MARKET_OUTBOUND_MODE,
  MARKET_REGULATED_CAPABILITIES_MODE,
  MARKET_SCOPE_COUNTS,
  MARKET_SCOPE_DECISION_STATUS,
  MARKET_SCOPE_VERSION,
  PROTECTED_MARKETS,
  marketScopeForIso2,
} from "@/lib/generated/europeMarkets";
import { LOCALE_MARKET_BY_CODE } from "@/lib/generated/localeRegistry";

const STORAGE_KEY = "cambra_market";
const ANALYZER_ENABLED_MARKETS = ACTIVE_LAUNCH_MARKETS;

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
  const code = isKnownMarket(marketCode) ? marketCode.toUpperCase() : null;
  if (!code) {
    return Object.freeze({
      marketCode: null,
      market: null,
      currency: null,
      locale: null,
      scope: Object.freeze({
        status: "UNKNOWN_BLOCKED",
        decisionStatus: MARKET_SCOPE_DECISION_STATUS,
        version: MARKET_SCOPE_VERSION,
        launchActive: false,
        researchAllowed: false,
        researchOnly: false,
      }),
      landing: Object.freeze({ status: "BLOCKED", reason: "UNKNOWN_MARKET" }),
      analyzer: Object.freeze({
        status: "BLOCKED",
        href: "/Contact?intent=market-access",
        reason: "MARKET_NOT_CANONICAL",
      }),
      recovery: Object.freeze({ status: "BLOCKED", reason: "MARKET_NOT_CANONICAL" }),
      outbound: Object.freeze({ status: MARKET_OUTBOUND_MODE, capacity: 0, allowed: false }),
      regulated: Object.freeze({
        status: MARKET_REGULATED_CAPABILITIES_MODE,
        authorizedByMarketMembership: false,
      }),
      legal: Object.freeze({ status: "LEGAL_REVIEW_REQUIRED", translationStatus: "UNKNOWN" }),
      translation: Object.freeze({
        status: "UNKNOWN",
        defaultLocale: null,
        fallbackLocale: null,
        supportedLocales: Object.freeze([]),
      }),
    });
  }
  const market = EUROPE_MARKET_BY_ISO2[code];
  const locale = LOCALE_MARKET_BY_CODE[code];
  const marketScope = marketScopeForIso2(code);
  const analyzerEnabled = marketScope.launch_active;

  return Object.freeze({
    marketCode: code,
    market,
    currency: market.primary_currency,
    locale,
    scope: Object.freeze({
      status: marketScope.scope_status,
      decisionStatus: MARKET_SCOPE_DECISION_STATUS,
      version: MARKET_SCOPE_VERSION,
      launchActive: marketScope.launch_active,
      researchAllowed: marketScope.research_allowed,
      researchOnly: marketScope.research_only,
    }),
    landing: Object.freeze({ status: "AVAILABLE", reason: "INFORMATIONAL_SURFACE" }),
    analyzer: Object.freeze({
      status: analyzerEnabled ? "ENABLED" : "LIMITED",
      href: analyzerEnabled
        ? `/Analyzer?market=${encodeURIComponent(code)}`
        : `/Contact?market=${encodeURIComponent(code)}&intent=market-access`,
      reason: analyzerEnabled ? "MARKET_POLICY_ENABLED" : "PROTECTED_MARKET_RESEARCH_ONLY",
    }),
    recovery: Object.freeze({
      status: analyzerEnabled ? "REVIEW_REQUIRED" : "BLOCKED",
      reason: analyzerEnabled ? "CASE_AND_LEGAL_REVIEW_REQUIRED" : "PROTECTED_MARKET_RESEARCH_ONLY",
    }),
    outbound: Object.freeze({ status: MARKET_OUTBOUND_MODE, capacity: 0, allowed: false }),
    regulated: Object.freeze({
      status: MARKET_REGULATED_CAPABILITIES_MODE,
      authorizedByMarketMembership: false,
    }),
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

export {
  ACTIVE_LAUNCH_MARKETS,
  ANALYZER_ENABLED_MARKETS,
  EUROPE_MARKETS,
  MARKET_SCOPE_COUNTS,
  PROTECTED_MARKETS,
};

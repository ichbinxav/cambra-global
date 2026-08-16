import { LOCALE_MARKET_BY_CODE, LOCALE_REGISTRY, PRODUCT_LOCALES } from './generated/localeRegistry.ts';

export const LOCALE_RUNTIME_VERSION = 'p9-locale-runtime-1.0.0';
export const TRANSLATION_GLOSSARY_VERSION = 'p9-glossary-1.0.0';
export const PRODUCT_LOCALE_CODES = Object.freeze(PRODUCT_LOCALES.map((x:any) => x.locale));

export const CAMBRA_TERMINOLOGY = Object.freeze({
  verified_savings: { en: 'verified savings', fr: 'économies vérifiées', es: 'ahorro verificado', definition: 'Savings evidenced after activation; never a forecast.' },
  effective_rate: { en: 'effective rate', fr: 'taux effectif', es: 'tasa efectiva', definition: 'Total evidenced payment cost divided by applicable processed volume.' },
  benchmark: { en: 'benchmark', fr: 'benchmark', es: 'benchmark', definition: 'A cohort statistic with provenance, sample size and uncertainty.' },
  recover: { en: 'Recover', fr: 'Recover', es: 'Recover', definition: 'CAMBRA governed recovery service; a product name, not a promise.' },
  launch_readiness: { en: 'launch readiness', fr: 'préparation au lancement', es: 'preparación para el lanzamiento', definition: 'Explainable readiness with hard blockers that cannot be averaged away.' },
});

const cleanLocale = (value:any) => String(value || '').trim().replace('_', '-');
const languageOf = (value:any) => cleanLocale(value).split('-')[0].toLowerCase();

export function localeForLanguage(value:any) {
  const language = languageOf(value);
  return (PRODUCT_LOCALES as any[]).find((x:any) => x.language === language)?.locale || LOCALE_REGISTRY.fallbackLocale;
}

export function normalizeProductLocale(value:any, allowed:any[] = PRODUCT_LOCALE_CODES as any[]) {
  const raw = cleanLocale(value);
  if (!raw) return null;
  const exact = allowed.find((x:any) => String(x).toLowerCase() === raw.toLowerCase());
  if (exact) return exact;
  const language = languageOf(raw);
  return allowed.find((x:any) => languageOf(x) === language) || null;
}

export function resolveLocale(input:any = {}) {
  const marketCode = String(input.market_code || '').trim().toUpperCase();
  const market:any = (LOCALE_MARKET_BY_CODE as any)[marketCode] || null;
  const allowed = market?.supported_product_locales || PRODUCT_LOCALE_CODES;
  const candidates:any[] = [
    { source: 'explicit_user', value: input.explicit_locale, authoritative: true },
    { source: 'merchant_preference', value: input.merchant_locale },
    { source: 'route', value: input.route_locale },
    { source: 'domain', value: input.domain_locale },
  ];
  if (market) candidates.push({ source: 'market_default', value: market.default_locale });
  for (const value of Array.isArray(input.browser_locales) ? input.browser_locales : [input.browser_locale]) candidates.push({ source: 'browser', value });
  const geoMarket:any = (LOCALE_MARKET_BY_CODE as any)[String(input.geolocation_market || '').toUpperCase()] || null;
  if (geoMarket) candidates.push({ source: 'geolocation_hint', value: geoMarket.default_locale });
  candidates.push({ source: 'global_fallback', value: LOCALE_REGISTRY.fallbackLocale });
  for (const candidate of candidates) {
    const locale = normalizeProductLocale(candidate.value, allowed) || (candidate.authoritative ? normalizeProductLocale(candidate.value) : null);
    if (!locale) continue;
    const profile:any = (PRODUCT_LOCALES as any[]).find((x:any) => x.locale === locale);
    return {
      locale,
      language: profile?.language || languageOf(locale),
      source: candidate.source,
      market_code: market?.market_code || null,
      currency: market?.currency || String(input.currency || 'EUR').toUpperCase(),
      timezone: market?.timezone || String(input.timezone || 'UTC'),
      fallback_locale: market?.fallback_locale || LOCALE_REGISTRY.fallbackLocale,
      fallback_used: candidate.source === 'global_fallback' || Boolean(market && !market.native_locales.some((x:any) => languageOf(x) === languageOf(locale))),
      explicit_override_honored: candidate.source === 'explicit_user',
      geolocation_locked: false,
      registry_version: LOCALE_REGISTRY.registryVersion,
    };
  }
  throw new Error('locale_resolution_failed');
}

export function formatMoneyMajor(amount:any, options:any = {}) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return '';
  const locale = normalizeProductLocale(options.locale) || LOCALE_REGISTRY.fallbackLocale;
  const currency = String(options.currency || 'EUR').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('invalid_currency');
  return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: options.minimumFractionDigits, maximumFractionDigits: options.maximumFractionDigits ?? 2 }).format(value);
}

export function formatMoneyMinor(amountMinor:any, options:any = {}) {
  if (!Number.isSafeInteger(amountMinor)) return '';
  const minorUnits = Number.isInteger(options.minor_units) ? options.minor_units : 2;
  return formatMoneyMajor(amountMinor / (10 ** minorUnits), options);
}

export function formatLocaleNumber(value:any, options:any = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  const locale = normalizeProductLocale(options.locale) || LOCALE_REGISTRY.fallbackLocale;
  return new Intl.NumberFormat(locale, options.format_options || {}).format(number);
}

export function formatLocaleDateTime(value:any, options:any = {}) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const locale = normalizeProductLocale(options.locale) || LOCALE_REGISTRY.fallbackLocale;
  const timeZone = String(options.timezone || 'UTC');
  return new Intl.DateTimeFormat(locale, { timeZone, ...(options.format_options || {}) }).format(date);
}

export function pluralCategory(value:any, locale:any) {
  const normalized = normalizeProductLocale(locale) || LOCALE_REGISTRY.fallbackLocale;
  return new Intl.PluralRules(normalized).select(Number(value));
}

export function translationFallbackChain(locale:any) {
  const selected = normalizeProductLocale(locale) || LOCALE_REGISTRY.fallbackLocale;
  return [...new Set([selected, LOCALE_REGISTRY.fallbackLocale])];
}

function interpolationTokens(value:any) {
  return [...new Set([...String(value || '').matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((x) => x[1]))].sort();
}

export function auditTranslationCatalog(catalogs:Record<string,Record<string,any>>, usedKeys:string[] = []) {
  const locales = Object.keys(catalogs);
  const canonical = catalogs.en || catalogs[locales[0]] || {};
  const canonicalKeys = Object.keys(canonical).sort();
  const missing:any[] = [], orphan:any[] = [], interpolation_mismatches:any[] = [], empty:any[] = [];
  for (const locale of locales) {
    const catalog = catalogs[locale] || {};
    for (const key of canonicalKeys) {
      if (!(key in catalog)) missing.push({ locale, key });
      else if (typeof catalog[key] !== 'string' || (!catalog[key].trim() && catalog[key] !== '')) empty.push({ locale, key });
      else if (JSON.stringify(interpolationTokens(catalog[key])) !== JSON.stringify(interpolationTokens(canonical[key]))) interpolation_mismatches.push({ locale, key });
    }
    for (const key of Object.keys(catalog)) if (!(key in canonical)) orphan.push({ locale, key });
  }
  const used = new Set(usedKeys);
  return {
    ok: missing.length === 0 && orphan.length === 0 && interpolation_mismatches.length === 0 && empty.length === 0,
    locales,
    canonical_key_count: canonicalKeys.length,
    missing,
    orphan,
    interpolation_mismatches,
    empty,
    unused: used.size ? canonicalKeys.filter((key) => !used.has(key)) : [],
    mixed_language_detection: 'REQUIRES_HUMAN_OR_SPECIALIZED_REVIEW',
  };
}

export function localizationReadiness(marketCode:any) {
  const market:any = (LOCALE_MARKET_BY_CODE as any)[String(marketCode || '').toUpperCase()];
  if (!market) return { status: 'UNKNOWN_MARKET', launch_gate: 'BLOCK', reason_codes: ['market_not_in_registry'] };
  const productReady = market.translation_readiness === 'NATIVE_PRODUCT';
  return {
    status: productReady ? 'READY_WITH_LEGAL_REVIEW' : 'LIMITED',
    launch_gate: productReady ? 'REVIEW' : 'BLOCK_FULL_LAUNCH',
    market_code: market.market_code,
    product_locale: market.default_locale,
    translation_readiness: market.translation_readiness,
    legal_translation_status: market.legal_translation_status,
    legal_applicability_status: market.legal_applicability_status,
    reason_codes: [
      ...(productReady ? [] : ['native_product_translation_missing_or_partial']),
      'legal_applicability_requires_p10_review',
      'client_side_single_url_seo_has_no_hreflang',
    ],
    registry_version: LOCALE_REGISTRY.registryVersion,
  };
}

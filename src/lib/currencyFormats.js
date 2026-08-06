// currencyFormats.js — Checkpoint H (2026-08-06).
//
// SINGLE SOURCE for merchant-facing EUR rendering, extracted because three
// copies of the same helper had already drifted apart:
//   • Dashboard.jsx        → formatEurLocal(n, lang)   (localized, correct)
//   • ActionCenter.jsx     → eur(n, lang)              (localized, identical)
//   • DashboardHeroV2.jsx  → eur(n)                    (HARDCODED "en-US")
//
// The third one is the same class of bug as the date defect: the headline figure
// on the dashboard rendered with US grouping ("€1,234") inside a French or
// Spanish page, where the separators are inverted. Because it produced a
// perfectly plausible string, no missing-key check could ever surface it.
//
// Rounding and the €-fallback behaviour are preserved verbatim from the
// localized copies, so no displayed amount changes for EN.

const LOCALE_BY_LANG = { en: "en-IE", fr: "fr-FR", es: "es-ES" };

// Whole-euro amount in the ACTIVE app language. Negative values floor to 0
// (a "potential savings" figure is never shown as negative).
export function formatEur(value, lang) {
  const v = Math.max(0, Math.round(Number(value) || 0));
  const locale = LOCALE_BY_LANG[lang] || LOCALE_BY_LANG.en;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(v);
  } catch {
    return `€${v.toLocaleString()}`;
  }
}

// Same as formatEur, but a non-finite input yields an em dash instead of €0 —
// the confidence-band behaviour the hero relies on, where a missing bound must
// read as "unknown", not as "zero".
export function formatEurOrDash(value, lang) {
  return isFinite(Number(value)) ? formatEur(value, lang) : "—";
}

export { LOCALE_BY_LANG };
// dateFormats — Checkpoint H (2026-08-06).
//
// The app's date rendering, in ONE place.
//
// WHY THIS EXISTS: the authenticated pages each formatted dates their own way,
// and every variant defaulted to the wrong language:
//   • /Reports used date-fns `format()` with no locale argument → English for
//     every merchant, whatever they had chosen ("August 6, 2026").
//   • /Invoices used `toLocaleDateString()` with no argument → the BROWSER's
//     locale, which is not the app language either: a French merchant on an
//     English-configured laptop got English dates while the rest of the page
//     was French.
// Both are silent: a wrong-language date is still a valid-looking date.
//
// These helpers take `lang` explicitly rather than reading the i18n context,
// because some callers (chart axis builders, table cells inside .map()) format
// outside a component body.
//
// The i18n formatDate() helper is deliberately NOT reused: it renders month+year
// only ("August 2026"), which would erase the day from an invoice or an audit row.

export const LOCALE_BY_LANG = { en: "en-GB", fr: "fr-FR", es: "es-ES" };

const localeFor = (lang) => LOCALE_BY_LANG[lang] || LOCALE_BY_LANG.en;

// An invalid date must render as "" (the caller shows its own em dash), never
// "Invalid Date" — which is what toLocaleDateString() produces.
const safeFormat = (date, lang, options) => {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(localeFor(lang), options).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
};

/** Compact numeric date for tables: "06/08/2026" / "6/8/2026". */
export const formatNumericDate = (date, lang) =>
  safeFormat(date, lang, { day: "2-digit", month: "2-digit", year: "numeric" });

/** Chart axis: "6 Aug" / "6 août" / "6 ago". */
export const formatShortDate = (date, lang) =>
  safeFormat(date, lang, { day: "numeric", month: "short" });

/** Row headline: "6 August 2026" / "6 août 2026" / "6 de agosto de 2026". */
export const formatLongDate = (date, lang) =>
  safeFormat(date, lang, { day: "numeric", month: "long", year: "numeric" });

/** 24h clock — same in all three locales, kept explicit for stability. */
export const formatTime = (date, lang) =>
  safeFormat(date, lang, { hour: "2-digit", minute: "2-digit", hour12: false });
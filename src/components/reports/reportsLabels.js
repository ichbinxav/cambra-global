// reportsLabels — Checkpoint H (2026-08-06).
//
// The /Reports page's two display concerns that were NOT plain text, and that a
// t() sweep alone would have left broken:
//
//  1. VERIFICATION STATUS. The page printed the raw stored enum through
//     `verification_status.replaceAll("_", " ")`, so every merchant — English,
//     French or Spanish — read "evidence submitted". The stored values are
//     untouched here; only their display is mapped. An unknown status falls back
//     to the de-underscored raw value, which is honest and debuggable, rather
//     than to an empty pill that would hide a real state.
//
//  2. DATES. The rows used date-fns `format()` with no locale argument, which
//     silently defaults to English: "August 6, 2026" for a French merchant who
//     had chosen French. Intl with the active language fixes it, and it is also
//     why these helpers take `lang` instead of reading a context — the chart
//     builds its axis labels outside the component tree.
//
// The i18n formatDate() helper is deliberately NOT reused: it renders month+year
// only ("August 2026"), which would erase the day from an audit timeline.

export const LOCALE_BY_LANG = { en: "en-GB", fr: "fr-FR", es: "es-ES" };

const localeFor = (lang) => LOCALE_BY_LANG[lang] || LOCALE_BY_LANG.en;

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

/** Chart axis: "6 Aug" / "6 août" / "6 ago". */
export const formatShortDate = (date, lang) =>
  safeFormat(date, lang, { day: "numeric", month: "short" });

/** History row: "6 August 2026" / "6 août 2026" / "6 de agosto de 2026". */
export const formatLongDate = (date, lang) =>
  safeFormat(date, lang, { day: "numeric", month: "long", year: "numeric" });

/** 24h clock — same in all three locales, kept explicit for stability. */
export const formatTime = (date, lang) =>
  safeFormat(date, lang, { hour: "2-digit", minute: "2-digit", hour12: false });

/** Stored verification_status → translated label (de-underscored raw when unknown). */
export function verificationStatusLabel(t, value) {
  if (!value) return "";
  const key = `rpt_vst_${value}`;
  const label = t(key);
  return label && label !== key ? label : String(value).replaceAll("_", " ");
}

/**
 * The coarse three-way badge on each history row.
 * Kept as its own mapping because it is NOT the same vocabulary as
 * verification_status: it collapses many statuses into Verified / Provisional /
 * Estimated. Colours travel with the label so the two can never drift apart.
 */
export function historyBadge(t, verificationStatus) {
  if (verificationStatus === "verified") {
    return { label: t("rpt_vs_verified"), className: "text-[#2FE0A8] bg-[#2FE0A8]/10 border-[#2FE0A8]/25" };
  }
  if (verificationStatus === "pending_verification") {
    return { label: t("rpt_vs_provisional"), className: "text-[#7BD9F0] bg-[#7BD9F0]/10 border-[#7BD9F0]/25" };
  }
  return { label: t("rpt_vs_estimated"), className: "text-[#FFB05A] bg-[#FFB05A]/10 border-[#FFB05A]/25" };
}
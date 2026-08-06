// reportsLabels — Checkpoint H (2026-08-06).
//
// /Reports-specific display mapping. The DATE helpers moved to
// src/lib/dateFormats.js once /Invoices needed the same fix (it had its own,
// differently-broken variant) — they are re-exported here so the reports
// components keep a single import, but there is only ONE implementation.
//
// What stays here is the enum display the page used to get wrong: it printed the
// raw stored status through `verification_status.replaceAll("_", " ")`, so every
// merchant — English, French or Spanish — read "evidence submitted". The stored
// values are untouched; only their display is mapped. An unknown status falls
// back to the de-underscored raw value, which is honest and debuggable, rather
// than to an empty pill that would hide a real state.

export { formatShortDate, formatLongDate, formatTime, LOCALE_BY_LANG } from "@/lib/dateFormats";

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
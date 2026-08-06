// vaultLabels — Checkpoint H (2026-08-06).
//
// The Vault's enum vocabularies, and the ONLY place they are listed.
//
// DISPLAY vs STORED: the arrays hold the values the entity actually stores
// ('benchmark_evidence', 'superseded'). The page used to render those raw, so a
// merchant read `provider_proposals` in the UI. The helpers below map a stored
// value to a translated label WITHOUT touching what is stored — the filters, the
// upload payload and the records are byte-identical to before.
//
// UNKNOWN VALUES FALL BACK TO THE RAW VALUE, on purpose: if the backend starts
// storing a category this list does not know, showing `new_category` is honest and
// debuggable, whereas showing "" would silently hide a real document.
//
// TARGET TYPES are deliberately NOT translated: they are entity identifiers the
// operator matches against an ID they paste in ('deal_activation', 'baseline').
// Localizing them would break that correspondence.

export const DOC_CATEGORIES = [
  "invoices",
  "statements",
  "provider_proposals",
  "contracts",
  "signed_mandates",
  "tax_docs",
  "screenshots",
  "benchmark_evidence",
  "migration_docs",
  "pricing_docs",
  "internal_files",
];

export const DOC_STATUSES = ["pending", "approved", "rejected", "superseded"];

export const LINK_TARGET_TYPES = [
  "brand",
  "deal_activation",
  "provider",
  "mandate",
  "monthly_savings_report",
  "invoice",
  "contract",
  "statement_import",
  "verification_event",
  "baseline",
  "savings_evidence",
  "payment_event",
];

/** Stored category value → translated label (raw value when unknown). */
export function categoryLabel(t, value) {
  if (!value) return "";
  const key = `vlt_cat_${value}`;
  const label = t(key);
  return label && label !== key ? label : value;
}

/** Stored review_status value → translated label (raw value when unknown). */
export function statusLabel(t, value) {
  if (!value) return "";
  const key = `vlt_st_${value}`;
  const label = t(key);
  return label && label !== key ? label : value;
}
// invoiceLabels — Checkpoint H (2026-08-06).
//
// The invoice status vocabulary. The table used to print the stored value
// straight into the cell, so a merchant read "partially_paid" and "void".
//
// The list mirrors the Invoice entity's status enum. The stored values are
// unchanged — this is display only, and an unknown status falls back to the
// de-underscored raw value so a new state stays visible instead of blanking out.

export const INVOICE_STATUSES = [
  "draft",
  "issued",
  "sent",
  "due",
  "partially_paid",
  "paid",
  "failed",
  "void",
  "disputed",
  "overdue",
  "refunded",
];

/** Stored status → translated label (de-underscored raw when unknown). */
export function invoiceStatusLabel(t, value) {
  if (!value) return "";
  const key = `inv_st_${value}`;
  const label = t(key);
  return label && label !== key ? label : String(value).replaceAll("_", " ");
}
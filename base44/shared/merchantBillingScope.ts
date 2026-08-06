// merchantBillingScope — v61 Checkpoint D (2026-08-06).
//
// WHY THIS EXISTS
// ───────────────
// /Invoices and /Reports used to read Invoice / MonthlySavingsReport / Baseline
// DIRECTLY from the browser with a CLIENT-SUPPLIED brand_id filter. Two problems,
// both real:
//
//   1. FAILS CLOSED TODAY. Those three entities are written by service role, so
//      `created_by == {{user.email}}` never matches an app user (KNOWN_DEBT
//      BUG-6). The merchant's own invoices and monthly reports therefore render
//      as an empty table — not a leak, but a broken promise.
//   2. WOULD FAIL OPEN TOMORROW. The tenant boundary was a brand_id in a request
//      the browser controls. The day RLS is relaxed (the BUG-6 migration), the
//      only thing standing between tenant A and tenant B's invoices would be a
//      client-side argument.
//
// So the tenant scope is resolved SERVER-SIDE from the authenticated session and
// nothing else. This module holds the PURE half of that logic (ownership +
// projections) so it can be exercised by an isolation matrix in vitest; the
// backend function does the I/O.
//
// PROJECTIONS ARE PART OF THE SECURITY BOUNDARY, not cosmetics. A merchant is
// entitled to their own figures, not to the internal accounting/tax evidence
// attached to them: billing_snapshot_json, vies_evidence_json,
// supporting_snapshot_json, processor ids and Stripe internals stay server-side.
// A projection allowlist COPIES FIELDS BY NAME — it never spreads the row — so a
// future schema field is invisible until someone deliberately exposes it.
//
// Pure module: no SDK, no I/O. Runs in Deno (backend) and vitest (node).

export function normalizeEmail(email: unknown): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

/**
 * Is this Brand owned by this email?
 *
 * Mirrors the two owner pivots Brand's own RLS already recognizes:
 * data.contact_email and created_by. `id`-less or emailless input is never
 * owned (deny by default) — an absent owner is not a wildcard.
 */
export function isBrandOwnedBy(brand: any, email: unknown): boolean {
  const who = normalizeEmail(email);
  if (!who || !brand || !brand.id) return false;
  return normalizeEmail(brand.contact_email) === who || normalizeEmail(brand.created_by) === who;
}

/** The caller's active brand: newest brand they actually own, else null. */
export function pickOwnedBrand(brands: any[], email: unknown): any | null {
  const owned = (Array.isArray(brands) ? brands : []).filter(b => isBrandOwnedBy(b, email));
  return owned[0] || null;
}

/**
 * Defense-in-depth: drop any row that does not belong to the resolved brand,
 * even though the query was already scoped. A blank/absent brand_id on the row
 * is DROPPED, not kept — an unattributed billing row is never "probably yours".
 */
export function keepRowsForBrand<T extends { brand_id?: unknown }>(rows: T[], brandId: unknown): T[] {
  const id = String(brandId || '');
  if (!id) return [];
  return (Array.isArray(rows) ? rows : []).filter(r => String(r?.brand_id || '') === id);
}

// ── Projections (allowlists — copy by name, never spread) ───────────────────

export function projectInvoice(inv: any) {
  return {
    id: inv.id,
    invoice_number: inv.invoice_number || null,
    month: inv.month || null,
    status: inv.status || null,
    currency: inv.currency || 'EUR',
    issued_at: inv.issued_at || null,
    due_at: inv.due_at || null,
    paid_at: inv.paid_at || null,
    subtotal_amount: typeof inv.subtotal_amount === 'number' ? inv.subtotal_amount : null,
    tax_amount: typeof inv.tax_amount === 'number' ? inv.tax_amount : null,
    total_amount: typeof inv.total_amount === 'number' ? inv.total_amount : null,
    balance_due: typeof inv.balance_due === 'number' ? inv.balance_due : null,
    // The merchant's own payment page. Stripe customer / payment-intent /
    // charge ids and the billing snapshot deliberately do NOT travel.
    hosted_invoice_url: inv.hosted_invoice_url || null,
    service_period_start: inv.service_period_start || null,
    service_period_end: inv.service_period_end || null,
  };
}

export function projectReport(r: any) {
  return {
    id: r.id,
    month: r.month || null,
    vertical: r.vertical || null,
    status: r.status || null,
    verification_status: r.verification_status || null,
    measurement_mode: r.measurement_mode || null,
    currency: r.currency || 'EUR',
    baseline_cost: typeof r.baseline_cost === 'number' ? r.baseline_cost : null,
    actual_cost: typeof r.actual_cost === 'number' ? r.actual_cost : null,
    savings: typeof r.savings === 'number' ? r.savings : null,
    node_fee: typeof r.node_fee === 'number' ? r.node_fee : null,
    effective_fee_pct: typeof r.effective_fee_pct === 'number' ? r.effective_fee_pct : null,
    standard_fee_pct: typeof r.standard_fee_pct === 'number' ? r.standard_fee_pct : null,
    discount_pct: typeof r.discount_pct === 'number' ? r.discount_pct : null,
    evidence_count: typeof r.evidence_count === 'number' ? r.evidence_count : 0,
    // supporting_snapshot_json / calculation_hash / billing_block_reason are
    // internal audit + admin surfaces — not merchant payload.
  };
}

export function projectBaseline(b: any) {
  return {
    id: b.id,
    locked: !!b.locked,
    locked_at: b.locked_at || null,
    verified_at: b.verified_at || null,
    baseline_type: b.baseline_type || null,
    baseline_value: typeof b.baseline_value === 'number' ? b.baseline_value : null,
    currency: b.currency || 'EUR',
    period_start: b.period_start || null,
    period_end: b.period_end || null,
    // snapshot_json (raw provider extraction) stays server-side.
  };
}
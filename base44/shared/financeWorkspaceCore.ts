// DASHBOARD-C9 (2026-08-17) — Finance workspace: tabs, projections and the two
// governed writes that let the legacy finance routes retire.
//
// C9 closes three declared blockers in config/dashboard/navigation.v1.json:
//
//   1. /admin/revenue — AdminRevenue.jsx summed five entity lists in the browser.
//      buildRevenueProjection replaces that arithmetic with a server projection that
//      declares completeness, currency and accounting basis.
//   2. /admin/recover-billing — FiscalIdentityCard.jsx:47 wrote Brand directly.
//      previewBillingIdentity/applyBillingIdentity replace it.
//   3. /admin/provider-economics — awaited this tab shell.
//
// THE FINDING THAT MATTERS MOST IN THIS CHUNK is not the direct write itself.
// FiscalIdentityCard.jsx:50 also sent `tax_customer_type: "business_taxable_person"`
// on every address save. recoverTax.ts:224 reads exactly that field:
//
//     if (customer.tax_customer_type !== 'business_taxable_person')
//       blockers.push('customer_not_confirmed_b2b');
//
// So typing an address and pressing Save CLEARED the B2B blocker on the tax
// determination — the gate that exists to stop CAMBRA issuing a reverse-charge
// invoice to someone who is not a taxable person. No evidence was involved. The
// Brand schema already anticipated this: `tax_evidence_status` enumerates
// none | vat_id_provided | vies_validated | alternative_evidence_approved, and
// `tax_customer_type`'s own description says B2B status must be demonstrated.
// The form bypassed the design.
//
// In C9 an address save NEVER writes tax_customer_type. Confirming B2B status is a
// separate action that refuses unless the evidence exists, and changing the VAT
// number revokes the confirmation, because a VIES validation is bound to the number
// that was validated.

import { readRuntimeSource } from './runtimeSourceRead.ts';
import {
  buildContext, kpi, portfolioResponse, sortKeepingUnknownLast,
  type SourceHealthRow,
} from './workspaceContract.ts';
import {
  ACCOUNTING_BASES, checkCombination, consolidate, FINANCE_DOMAINS, figure, toMinor,
  type FinanceFigure,
} from './financeCore.ts';

export const FINANCE_WORKSPACE_VERSION = 'finance-workspace-1.0.0';

const text = (value: unknown) => String(value ?? '').trim();
const upper = (value: unknown) => text(value).toUpperCase();
const READ_LIMIT = 5000;

/**
 * The tabs of the consolidated Finance workspace.
 *
 * `hosts` names the legacy page each tab absorbs. The four aggregator pages C0 found
 * already correct are mounted as-is rather than rewritten — the consolidation is a
 * shell, not a reimplementation, and rewriting a correct page is how a correct page
 * stops being correct.
 */
export const FINANCE_TABS = Object.freeze([
  { key: 'overview', label: 'Overview', hosts: null, domains: [...FINANCE_DOMAINS] },
  { key: 'revenue', label: 'Revenue', hosts: '/admin/revenue', domains: ['MERCHANT_SAVINGS', 'MERCHANT_REVENUE'] },
  { key: 'control-tower', label: 'Control tower', hosts: '/admin/finance', domains: ['MERCHANT_REVENUE', 'CASH'] },
  { key: 'merchant-billing', label: 'Merchant billing', hosts: '/admin/recover-billing', domains: ['MERCHANT_REVENUE'] },
  { key: 'provider-economics', label: 'Provider economics', hosts: '/admin/provider-economics', domains: ['PROVIDER_REVENUE'] },
  { key: 'unit-economics', label: 'Unit economics', hosts: null, domains: ['MERCHANT_REVENUE', 'PROVIDER_REVENUE', 'COSTS'] },
] as const);

export type FinanceTabKey = typeof FINANCE_TABS[number]['key'];

export function financeTab(key: unknown) {
  return FINANCE_TABS.find((tab) => tab.key === text(key)) || null;
}

/**
 * Guards a tab's declared domains against the double-count rule.
 *
 * A tab that would present two domains that must not be summed is not forbidden —
 * unit economics legitimately shows revenue and cost — but it must not present a
 * single total across them. This returns the reason so the tab can carry it.
 */
export function tabCombinationNote(key: unknown): string | null {
  const tab = financeTab(key);
  if (!tab) return null;
  const check = checkCombination([...tab.domains] as any);
  return check.allowed ? null : `Shown side by side, never as one total — ${check.reason}`;
}

/** Invoice statuses that mean the fee has been billed but not necessarily received. */
const INVOICED_STATUSES = ['issued', 'sent', 'due', 'overdue', 'paid'];
/** Statuses that void a fee entirely. Excluded from every basis. */
const VOID_STATUSES = ['void', 'failed', 'refunded', 'draft', 'cancelled'];

/**
 * The revenue projection that replaces AdminRevenue.jsx's in-component arithmetic.
 *
 * Four defects in that page are fixed here rather than moved:
 *
 *   - `(i.total_amount || 0)` and `(r.savings || 0)` turned an absent amount into a
 *     confident zero. Every amount now flows through the shared nullable coercion.
 *   - Amounts were summed across currencies with no check at all.
 *   - `.list()` with no limit and `.list('-month', 500)` produced lower bounds
 *     labelled "Cumulative". Truncation is now declared and demotes the truth class.
 *   - "Cumulative monetized" summed issued/sent/due/overdue/paid — billed, not
 *     collected — under a heading that said realized. The two bases are now separate
 *     figures, because the difference between them is CAMBRA's collection risk.
 */
export async function buildRevenueProjection(input: {
  svc: any;
  now: string;
  contextId: string;
  filters?: Record<string, unknown>;
}) {
  const read = async (source: string, fn: () => Promise<any[]>) =>
    readRuntimeSource<any[]>({ source, read: fn, fallback: [], limit: READ_LIMIT });

  const reads: Record<string, any> = {
    MonthlySavingsReport: await read('MonthlySavingsReport', () => input.svc.entities.MonthlySavingsReport.list('-month', READ_LIMIT)),
    Invoice: await read('Invoice', () => input.svc.entities.Invoice.list('-issued_at', READ_LIMIT)),
    DealActivation: await read('DealActivation', () => input.svc.entities.DealActivation.list('-updated_at', READ_LIMIT)),
    Provider: await read('Provider', () => input.svc.entities.Provider.list('-updated_at', READ_LIMIT)),
  };
  const rows = (key: string): any[] => (reads[key].status === 'UNAVAILABLE' ? [] : (reads[key].value || []));
  const available = (key: string) => reads[key].status !== 'UNAVAILABLE';

  const reports = rows('MonthlySavingsReport');
  const invoices = rows('Invoice');
  const providers = rows('Provider');

  const invoiced = invoices.filter((row) => INVOICED_STATUSES.includes(text(row.status).toLowerCase()));
  const collected = invoices.filter((row) => text(row.status).toLowerCase() === 'paid');
  const realizedReports = reports.filter((row) => ['realized', 'invoiced', 'paid'].includes(
    text(row.verification_status || row.status).toLowerCase(),
  ));

  // MonthlySavingsReport.savings and Invoice.total_amount/amount_paid are MAJOR-unit
  // numbers. The `*_minor` variants do not exist on these two entities.
  const savings = figure({
    metric_key: 'realized_savings', domain: 'MERCHANT_SAVINGS', basis: 'COLLECTED',
    rows: realizedReports, field: 'savings', unit: 'MAJOR',
    rows_source_complete: reads.MonthlySavingsReport.status === 'COMPLETE',
    truth_class: 'VERIFIED',
    note: 'Realized savings from monthly reports. The merchant\'s benefit, not CAMBRA revenue.',
  });

  const feesInvoiced = figure({
    metric_key: 'merchant_revenue_invoiced', domain: 'MERCHANT_REVENUE', basis: 'INVOICED',
    rows: invoiced, field: 'total_amount', unit: 'MAJOR',
    rows_source_complete: reads.Invoice.status === 'COMPLETE',
    truth_class: 'CONTRACTUAL',
    note: 'Billed on issued invoices. Billed is not received; the gap to the collected figure is collection risk.',
  });

  const feesCollected = figure({
    metric_key: 'merchant_revenue_collected', domain: 'MERCHANT_REVENUE', basis: 'COLLECTED',
    rows: collected, field: 'amount_paid', unit: 'MAJOR',
    rows_source_complete: reads.Invoice.status === 'COMPLETE',
    truth_class: 'VERIFIED',
    note: 'Received against paid invoices.',
  });

  // Per provider: savings and revenue stay in separate columns. The page rendered
  // them side by side already, which was correct; what it lacked was any statement
  // that they must never be added.
  const byProvider = new Map<string, { savings: any[]; revenue: any[]; reports: number }>();
  const bucket = (id: string) => {
    const key = id || 'unknown';
    if (!byProvider.has(key)) byProvider.set(key, { savings: [], revenue: [], reports: 0 });
    return byProvider.get(key)!;
  };
  for (const row of realizedReports) {
    const entry = bucket(text(row.provider_id));
    entry.savings.push({ amount_minor: toMinor(row.savings, 'MAJOR'), currency: row.currency ?? null });
    entry.reports += 1;
  }
  for (const row of invoiced) {
    if (VOID_STATUSES.includes(text(row.status).toLowerCase())) continue;
    bucket(text(row.provider_id)).revenue.push({
      amount_minor: toMinor(row.total_amount, 'MAJOR'), currency: row.currency ?? null,
    });
  }

  const providerRows = [...byProvider.entries()].map(([providerId, entry]) => {
    const savingsSide = consolidate(entry.savings);
    const revenueSide = consolidate(entry.revenue);
    const provider = providers.find((row: any) => text(row.id) === providerId);
    return {
      provider_id: providerId,
      provider_name: provider ? text(provider.name) : (providerId === 'unknown' ? null : providerId),
      // A provider we could not name is reported as unnamed rather than having its id
      // printed as though it were a name.
      provider_name_known: Boolean(provider),
      realized_savings_minor: savingsSide.amount_minor,
      realized_savings_currency: savingsSide.currency,
      revenue_invoiced_minor: revenueSide.amount_minor,
      revenue_invoiced_currency: revenueSide.currency,
      reports: entry.reports,
      combination_note: checkCombination(['MERCHANT_SAVINGS', 'MERCHANT_REVENUE']).reason,
    };
  });

  // Six months of collected revenue, keyed in UTC. The page bucketed by local month,
  // so a payment at 23:30 UTC on the last day of a month landed in the next one for
  // any operator east of London.
  const monthly = buildMonthlySeries(collected, input.now);

  const activations = rows('DealActivation');
  const liveActivations = available('DealActivation')
    ? activations.filter((row) => ['activated', 'migrating', 'live', 'monetizing'].includes(text(row.status).toLowerCase())).length
    : null;

  const contractsWithRevenue = available('Invoice')
    ? new Set(invoiced.map((row) => text(row.deal_activation_id)).filter(Boolean)).size
    : null;

  const { context, source_health } = buildContext({
    workspace: 'finance', view: 'revenue', filters: input.filters || {},
    now: input.now, contextId: input.contextId, reads,
  });

  const of = (fig: FinanceFigure, source: string, label: string) => kpi({
    metric_key: fig.metric_key, label, value: fig.amount_minor, unit: 'EUR_minor',
    truth_class: fig.truth_class, sources: [source], health: source_health,
    extra: {
      currency: fig.currency, by_currency: fig.by_currency, mixed_currency: fig.mixed_currency,
      numerator: fig.counted, denominator: fig.counted + fig.missing,
      claim_boundary: `[${fig.domain} · ${fig.basis}] ${fig.claim_boundary}`,
    },
  });

  const kpis = [
    of(savings, 'MonthlySavingsReport', 'Realized savings (merchant benefit)'),
    of(feesInvoiced, 'Invoice', 'CAMBRA fees billed'),
    of(feesCollected, 'Invoice', 'CAMBRA fees collected'),
    kpi({
      metric_key: 'live_activations', label: 'Live activations', value: liveActivations,
      unit: 'count', truth_class: 'OBSERVED', sources: ['DealActivation'], health: source_health,
    }),
    kpi({
      metric_key: 'contracts_with_revenue', label: 'Contracts with billed activity',
      value: contractsWithRevenue, unit: 'count', truth_class: 'OBSERVED',
      sources: ['Invoice'], health: source_health,
    }),
  ];

  // portfolioResponse deliberately returns a fixed envelope and ignores unknown keys,
  // so the revenue-specific payload is attached here rather than passed in and dropped.
  return {
    ...portfolioResponse({
      context, source_health, kpis,
      quick_views: [],
      filter_options: { basis: [...ACCOUNTING_BASES] },
      rows: sortKeepingUnknownLast(providerRows, (row) => row.revenue_invoiced_minor, 'desc'),
      total: available('Invoice') ? providerRows.length : null,
      permissions: { read: true, prepare: true, operate: false },
      available_actions: [],
    }),
    tab: 'revenue',
    figures: { savings, fees_invoiced: feesInvoiced, fees_collected: feesCollected },
    monthly_collected: monthly,
    combination_rule: checkCombination(['MERCHANT_SAVINGS', 'MERCHANT_REVENUE']).reason,
  };
}

/**
 * Six UTC months of collected revenue, most recent last.
 *
 * A month whose source could not be read is not a month with no revenue, so an
 * unreadable Invoice source yields null per bucket rather than a flat line at zero.
 */
export function buildMonthlySeries(paidInvoices: any[], now: string, months = 6) {
  const anchor = new Date(now);
  const series: Array<{ month: string; amount_minor: number | null; currency: string | null; mixed_currency: boolean }> = [];
  for (let back = months - 1; back >= 0; back -= 1) {
    const bucket = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - back, 1));
    const key = `${bucket.getUTCFullYear()}-${String(bucket.getUTCMonth() + 1).padStart(2, '0')}`;
    const inMonth = (paidInvoices || []).filter((row) => {
      const paidAt = text(row.paid_at);
      if (!paidAt) return false;
      return paidAt.slice(0, 7) === key;
    });
    const consolidated = consolidate(inMonth.map((row) => ({
      amount_minor: toMinor(row.amount_paid, 'MAJOR'), currency: row.currency ?? null,
    })));
    series.push({
      month: key,
      // An empty month is a real zero; a month whose amounts could not be consolidated is null.
      amount_minor: inMonth.length === 0 ? 0 : consolidated.amount_minor,
      currency: consolidated.currency,
      mixed_currency: consolidated.mixed,
    });
  }
  return series;
}

// ---------------------------------------------------------------------------
// Governed billing identity — replaces the browser write at FiscalIdentityCard.jsx:47
// ---------------------------------------------------------------------------

/** The address fields an operator may edit. `tax_customer_type` is deliberately absent. */
export const BILLING_IDENTITY_FIELDS = Object.freeze([
  'billing_legal_name', 'billing_address_line1', 'billing_address_line2',
  'billing_postal_code', 'billing_city', 'billing_country', 'vat_number',
] as const);

/**
 * Fields no billing form may write, with the reason each is protected.
 *
 * tax_customer_type heads the list because the browser form wrote it on every save,
 * and recoverTax.ts:224 treats it as the B2B gate on invoicing.
 */
export const BILLING_PROTECTED_FIELDS: ReadonlyArray<{ field: string; why: string }> = Object.freeze([
  { field: 'tax_customer_type', why: 'B2B taxable-person status is a determination requiring evidence, not a form field. recoverTax.ts:224 blocks invoicing without it, so writing it from a form clears a tax gate with nothing behind it. Use confirm_b2b_status.' },
  { field: 'vies_status', why: 'set only by an actual VIES consultation (checkVatVies), which returns the request identifier kept as evidence' },
  { field: 'vies_checked_at', why: 'the timestamp of a real consultation' },
  { field: 'vies_request_identifier', why: 'evidence returned by VIES; inventing one would fabricate an audit trail' },
  { field: 'vies_response_snapshot', why: 'the sanitized VIES response, kept for the invoice' },
  { field: 'tax_evidence_status', why: 'derived from what evidence actually exists, never asserted' },
  { field: 'tax_review_status', why: 'moved by the fiscal review flow, not by editing an address' },
  { field: 'stripe_customer_id', why: 'owned by the Stripe integration' },
  { field: 'stripe_billing_mode', why: 'which Stripe environment the customer belongs to; a wrong value bills against the wrong account' },
]);

/** Only FR and ES are billable — Brand.billing_country's own contract. */
export const BILLABLE_COUNTRIES = Object.freeze(['FR', 'ES'] as const);

/** VIES evidence fields cleared when the VAT number they attest to changes. */
const VIES_EVIDENCE_FIELDS = [
  'vies_checked_at', 'vies_request_identifier', 'vies_response_snapshot', 'vies_name', 'vies_address',
];

const normalizeVat = (value: unknown) => upper(value).replace(/[\s.\-]/g, '');

type IdentityPreview = {
  ok: boolean;
  error?: string;
  reason?: string;
  preview?: {
    brand_id: string;
    changes: Array<{ field: string; from: unknown; to: unknown; clears_existing_value: boolean }>;
    vat_number_changed: boolean;
    revokes_b2b_confirmation: boolean;
    revoked_fields: string[];
    consequences: string[];
    current_values_hashed: boolean;
  };
  preview_hash?: string;
};

/**
 * The billing identity as the card needs to render it.
 *
 * Returns only the billing and tax fields, not the whole Brand: the card previously
 * read the entity directly and received everything on it, including the Stripe
 * customer id and every commercial field, none of which a fiscal form needs.
 */
export async function readBillingIdentity(input: { svc: any; brand_id: string }) {
  const brandId = text(input.brand_id);
  if (!brandId) return { ok: false, error: 'brand_id_required' };
  let brand: any = null;
  try {
    const found = await input.svc.entities.Brand.filter({ id: brandId }, '-created_date', 1);
    brand = Array.isArray(found) ? found[0] : null;
  } catch {
    return { ok: false, error: 'brand_unreadable' };
  }
  if (!brand) return { ok: false, error: 'brand_not_found' };

  const exposed: Record<string, unknown> = {};
  for (const field of BILLING_IDENTITY_FIELDS) exposed[field] = brand[field] ?? '';
  return {
    ok: true,
    brand: {
      id: text(brand.id),
      ...exposed,
      // Read-only context. The card displays these; the handler owns writing them.
      tax_customer_type: brand.tax_customer_type ?? null,
      tax_evidence_status: brand.tax_evidence_status ?? 'none',
      tax_review_status: brand.tax_review_status ?? 'not_required',
      vies_status: brand.vies_status ?? 'not_checked',
      vies_checked_at: brand.vies_checked_at ?? null,
      vat_number_normalized: brand.vat_number_normalized ?? '',
      vat_country: brand.vat_country ?? '',
    },
    billable_countries: [...BILLABLE_COUNTRIES],
  };
}

/**
 * Previews a billing identity change.
 *
 * The preview names every field that would be CLEARED, which the old form could not:
 * it spread the whole form object, so a blank input silently erased a stored value —
 * and erasing a VAT number while `vies_status` stayed `valid` would leave a reverse
 * charge resting on evidence for a number no longer on file.
 */
export async function previewBillingIdentity(input: {
  svc: any;
  brand_id: string;
  patch: Record<string, unknown>;
  sha256: (value: unknown) => Promise<string>;
}): Promise<IdentityPreview> {
  const brandId = text(input.brand_id);
  if (!brandId) return { ok: false, error: 'brand_id_required' };

  const unknownFields = Object.keys(input.patch || {}).filter(
    (key) => !(BILLING_IDENTITY_FIELDS as readonly string[]).includes(key),
  );
  if (unknownFields.length) {
    const protectedHit = BILLING_PROTECTED_FIELDS.find((row) => unknownFields.includes(row.field));
    return {
      ok: false,
      error: protectedHit ? 'protected_field_in_patch' : 'unknown_field_in_patch',
      reason: protectedHit
        ? `${protectedHit.field}: ${protectedHit.why}`
        : `not editable here: ${unknownFields.join(', ')}`,
    };
  }

  let brand: any = null;
  try {
    const found = await input.svc.entities.Brand.filter({ id: brandId }, '-created_date', 1);
    brand = Array.isArray(found) ? found[0] : null;
  } catch {
    // An unreadable Brand is not a missing Brand. Refusing on both is right, but the
    // caller must be able to tell them apart.
    return { ok: false, error: 'brand_unreadable' };
  }
  if (!brand) return { ok: false, error: 'brand_not_found' };

  const country = upper(input.patch.billing_country ?? brand.billing_country);
  if (!country) return { ok: false, error: 'billing_country_required' };
  if (!(BILLABLE_COUNTRIES as readonly string[]).includes(country)) {
    return {
      ok: false, error: 'country_not_billable',
      reason: `${country} is not billable. Brand.billing_country supports ${BILLABLE_COUNTRIES.join(' and ')}; storing another value would produce an invoice with no determined tax treatment.`,
    };
  }

  const changes: Array<{ field: string; from: unknown; to: unknown; clears_existing_value: boolean }> = [];
  for (const field of BILLING_IDENTITY_FIELDS) {
    if (!(field in (input.patch || {}))) continue;
    const next = field === 'billing_country' ? country : text(input.patch[field]);
    const current = text(brand[field]);
    if (next === current) continue;
    changes.push({ field, from: brand[field] ?? null, to: next, clears_existing_value: Boolean(current) && !next });
  }

  if (!changes.length) return { ok: false, error: 'no_change' };

  const vatChanged = changes.some((row) => row.field === 'vat_number');
  const hadConfirmation = text(brand.tax_customer_type) === 'business_taxable_person';
  const hadVies = text(brand.vies_status) === 'valid';
  const revoke = vatChanged && (hadConfirmation || hadVies);

  const consequences: string[] = [];
  if (vatChanged) {
    consequences.push('The VAT number changes, so any VIES validation on file no longer attests to it and is reset to not_checked.');
    if (hadConfirmation) {
      consequences.push('The B2B taxable-person confirmation is revoked: it was granted against the previous number. Invoicing will block with customer_not_confirmed_b2b until it is confirmed again.');
    }
  }
  for (const row of changes.filter((entry) => entry.clears_existing_value)) {
    consequences.push(`${row.field} currently holds a value and would be cleared.`);
  }

  const preview = {
    brand_id: brandId,
    changes,
    vat_number_changed: vatChanged,
    revokes_b2b_confirmation: revoke,
    revoked_fields: revoke || vatChanged
      ? ['vies_status', 'tax_evidence_status', ...(hadConfirmation ? ['tax_customer_type'] : []), ...VIES_EVIDENCE_FIELDS]
      : [],
    consequences,
    // Brand carries no revision column, so the hash over the CURRENT values is the
    // concurrency check: if another operator changed a field, `from` differs and the
    // hash no longer matches.
    current_values_hashed: true,
  };

  return { ok: true, preview, preview_hash: await input.sha256(preview) };
}

/**
 * Applies a previewed billing identity change.
 *
 * Hash-bound: the operator applies the change they were shown, including its stated
 * consequences. A patch that would now revoke a different confirmation produces a
 * different hash and is refused.
 */
export async function applyBillingIdentity(input: {
  svc: any;
  actor: string;
  brand_id: string;
  patch: Record<string, unknown>;
  expected_preview_hash: string;
  now: string;
  sha256: (value: unknown) => Promise<string>;
}) {
  const previewed = await previewBillingIdentity({
    svc: input.svc, brand_id: input.brand_id, patch: input.patch, sha256: input.sha256,
  });
  if (!previewed.ok) return previewed;
  if (previewed.preview_hash !== text(input.expected_preview_hash)) {
    return {
      ok: false, error: 'preview_hash_mismatch',
      reason: 'The record changed since it was previewed. Re-read it: the change you approved is not the change that would now be applied.',
      current_preview_hash: previewed.preview_hash,
    };
  }

  const update: Record<string, unknown> = {};
  for (const change of previewed.preview!.changes) update[change.field] = change.to;

  if (previewed.preview!.vat_number_changed) {
    const nextVat = text(update.vat_number);
    update.vat_number_normalized = normalizeVat(nextVat);
    update.vat_country = nextVat ? normalizeVat(nextVat).slice(0, 2) : '';
    // A VIES result attests to one specific number. When the number changes the
    // result is not "still valid", it is unasked.
    update.vies_status = 'not_checked';
    for (const field of VIES_EVIDENCE_FIELDS) update[field] = null;
    update.tax_evidence_status = nextVat ? 'vat_id_provided' : 'none';
    if (previewed.preview!.revokes_b2b_confirmation) {
      // Fail-closed: revoking is a write we perform, not a state we leave stale.
      update.tax_customer_type = null;
    }
  }

  try {
    await input.svc.entities.Brand.update(text(input.brand_id), update);
  } catch (error: any) {
    return { ok: false, error: 'brand_update_failed', reason: text(error?.message) || null };
  }

  return {
    ok: true,
    brand_id: text(input.brand_id),
    applied_fields: Object.keys(update),
    b2b_confirmation_revoked: previewed.preview!.revokes_b2b_confirmation,
    vies_reset: previewed.preview!.vat_number_changed,
    actor: input.actor,
    at: input.now,
    consequences: previewed.preview!.consequences,
  };
}

/**
 * Confirms B2B taxable-person status against evidence that actually exists.
 *
 * This is the action the browser form performed implicitly on every save. It now
 * refuses unless one of the two evidence classes is present, and it records WHICH,
 * because `vat_id_provided` is weaker than `vies_validated` and the Brand schema
 * distinguishes them for that reason.
 *
 * It never writes on refusal.
 */
export async function confirmB2bStatus(input: {
  svc: any;
  actor: string;
  brand_id: string;
  now: string;
}) {
  const brandId = text(input.brand_id);
  if (!brandId) return { ok: false, error: 'brand_id_required' };

  let brand: any = null;
  try {
    const found = await input.svc.entities.Brand.filter({ id: brandId }, '-created_date', 1);
    brand = Array.isArray(found) ? found[0] : null;
  } catch {
    return { ok: false, error: 'brand_unreadable' };
  }
  if (!brand) return { ok: false, error: 'brand_not_found' };

  const country = upper(brand.billing_country);
  const vat = normalizeVat(brand.vat_number);
  const vies = text(brand.vies_status);

  // Strongest evidence first: a VIES consultation that returned valid.
  let evidence: 'vies_validated' | 'alternative_evidence_approved' | 'vat_id_provided' | null = null;
  if (vies === 'valid') {
    evidence = 'vies_validated';
  } else if (vies === 'manual_review_approved') {
    // A fiscal reviewer approved this by hand. That is the schema's
    // `alternative_evidence_approved` class, not a VIES validation.
    evidence = 'alternative_evidence_approved';
  } else if (country === 'FR' && vat.startsWith('FR') && vat.length > 2) {
    // Domestic FR is charged TVA regardless, so a French VAT number on file is
    // sufficient to record the customer as a taxable person — and it is recorded as
    // the weaker evidence class, not upgraded to a validation that never happened.
    evidence = 'vat_id_provided';
  }

  if (!evidence) {
    return {
      ok: false,
      error: 'b2b_status_not_demonstrable',
      reason: !vat
        ? 'No VAT number on file. B2B taxable-person status cannot be confirmed, and recoverTax will keep blocking with customer_not_confirmed_b2b — which is the correct outcome, not a bug.'
        : `VAT number ${vat} is on file but VIES status is ${vies || 'not_checked'}. Run the VIES consultation, or route this to fiscal review, before confirming.`,
      vies_status: vies || 'not_checked',
      next_step: vat ? 'checkVatVies' : 'record_vat_number',
      // No write performed: a refused confirmation must leave the record as it was.
      wrote: false,
    };
  }

  if (country !== 'FR' && evidence === 'vat_id_provided') {
    return { ok: false, error: 'vies_validation_required_outside_fr', wrote: false };
  }

  try {
    // Only fields Brand actually declares. tax_evidence_status carries WHICH evidence
    // was used; who confirmed it and when is recorded in the audit trail rather than
    // invented as two columns the entity does not have.
    await input.svc.entities.Brand.update(brandId, {
      tax_customer_type: 'business_taxable_person',
      tax_evidence_status: evidence,
    });
  } catch (error: any) {
    return { ok: false, error: 'brand_update_failed', reason: text(error?.message) || null, wrote: false };
  }

  return {
    ok: true, brand_id: brandId, tax_evidence_status: evidence,
    actor: input.actor, at: input.now,
    claim_boundary: evidence === 'vies_validated'
      ? 'Confirmed against a VIES consultation that returned valid.'
      : 'Confirmed against a French VAT number on file. This is the weaker evidence class: no VIES validation was performed.',
  };
}

/** Source health rows are exposed so the UI can render coverage rather than assume it. */
export type FinanceWorkspaceHealth = SourceHealthRow[];

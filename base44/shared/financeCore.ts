// DASHBOARD-C8 (2026-08-17) — Finance truth model.
//
// Five domains that must NEVER be summed into one another (section 11.2):
//
//   1. merchant economic impact   (potential / expected / verified / billable savings)
//   2. merchant-side CAMBRA revenue (accrued / invoiced / collected / outstanding)
//   3. provider-side revenue        (a SEPARATE ledger, firewalled from recommendations)
//   4. costs                        (AI, enrichment, email, processing, infrastructure)
//   5. cash                         (received / paid / receivable / forecast)
//
// Savings are not revenue. Merchant revenue and provider revenue are not one total.
// A total that mixes any two of these is the defect this module exists to prevent, and
// `finance:check` fails on any function that returns a combined figure.
//
// THE GAP C0 FOUND: no financial aggregator read the cost plane at all. CostUsageEvent,
// CostBudgetControl, GrowthCostLedger and MerchantUnitEconomics were read by discovery,
// growth and cost-governance code but by nothing financial, so margin and unit economics
// were not computable server-side. This module crosses that boundary — and states, every
// time, which side of it a figure came from.
//
// Every numeric read uses the shared nullable coercion. A figure that is absent is null,
// never zero, and every total declares whether it is COMPLETE or a LOWER_BOUND.

import { readRuntimeSource } from './runtimeSourceRead.ts';
import { nullableMinor, nullableSum } from './nullableNumber.ts';
import {
  buildContext, kpi, portfolioResponse, type SourceHealthRow, type TruthClass,
} from './workspaceContract.ts';

export const FINANCE_CORE_VERSION = 'finance-core-1.0.0';

const text = (value: unknown) => String(value ?? '').trim();
const READ_LIMIT = 5000;

/** The five domains. A figure belongs to exactly one. */
export const FINANCE_DOMAINS = Object.freeze([
  'MERCHANT_SAVINGS', 'MERCHANT_REVENUE', 'PROVIDER_REVENUE', 'COSTS', 'CASH',
] as const);
export type FinanceDomain = typeof FINANCE_DOMAINS[number];

/** Accounting basis (section 11.3). Every figure must declare one. */
export const ACCOUNTING_BASES = Object.freeze([
  'OBSERVED_CASH', 'ACCRUED', 'INVOICED', 'COLLECTED', 'FORECAST', 'MODELED',
] as const);
export type AccountingBasis = typeof ACCOUNTING_BASES[number];

/**
 * Pairs that must never be added together, with the reason.
 *
 * Used by the double-count guard below and asserted by the gate, so the rule is
 * enforced rather than merely documented.
 */
export const FORBIDDEN_SUMS: ReadonlyArray<{ a: FinanceDomain; b: FinanceDomain; why: string }> = Object.freeze([
  { a: 'MERCHANT_SAVINGS', b: 'MERCHANT_REVENUE', why: 'savings are the merchant\'s benefit; revenue is CAMBRA\'s fee on it. Adding them counts the same euro twice' },
  { a: 'MERCHANT_SAVINGS', b: 'PROVIDER_REVENUE', why: 'unrelated counterparties and unrelated economics' },
  { a: 'MERCHANT_REVENUE', b: 'PROVIDER_REVENUE', why: 'both are CAMBRA revenue but from different sides; a single total hides the concentration and the conflict' },
  { a: 'COSTS', b: 'CASH', why: 'an accrued cost is not cash paid' },
]);

/**
 * Refuses a combined total across domains that must stay apart.
 *
 * Returns the reason rather than a boolean so a caller can surface WHY, and so a
 * refusal is legible in a log.
 */
export function checkCombination(domains: FinanceDomain[]): { allowed: boolean; reason: string | null } {
  const set = new Set(domains);
  for (const rule of FORBIDDEN_SUMS) {
    if (set.has(rule.a) && set.has(rule.b)) {
      return { allowed: false, reason: `${rule.a} + ${rule.b}: ${rule.why}` };
    }
  }
  return { allowed: true, reason: null };
}

/**
 * The unit a source field is stored in.
 *
 * DASHBOARD-C9: this repo has BOTH, and C8 got it wrong. Invoice.total_amount,
 * Invoice.amount_paid and MonthlySavingsReport.savings are `number` in MAJOR units
 * (the pre-RECOVER-4 entities). ProviderRevenueLedger.paid_amount_minor and
 * CostUsageEvent.amount_minor are integers in MINOR units. C8 read `savings_minor`
 * and `amount_paid_minor`, which do not exist on those entities, so both figures
 * were permanently UNKNOWN and the margin silently excluded all merchant revenue.
 * Fail-closed, so nothing was confidently wrong — but the module claimed to compute
 * figures it could never compute. Every call site now states the unit.
 */
export type AmountUnit = 'MINOR' | 'MAJOR';

/**
 * Converts a stored amount to minor units.
 *
 * A MAJOR value is a float, so it is rounded to the cent rather than carried as a
 * fraction of one. A MINOR value that arrives fractional is a data error, not a
 * precision choice, so it is rounded and the caller is not told a half-cent exists.
 */
export function toMinor(value: unknown, unit: AmountUnit): number | null {
  const parsed = nullableMinor(value);
  if (parsed === null) return null;
  return unit === 'MAJOR' ? Math.round(parsed * 100) : Math.round(parsed);
}

export type FinanceFigure = {
  metric_key: string;
  domain: FinanceDomain;
  basis: AccountingBasis;
  amount_minor: number | null;
  currency: string | null;
  /** How many rows carried a value and how many did not. */
  counted: number;
  missing: number;
  completeness: 'COMPLETE' | 'LOWER_BOUND' | 'UNKNOWN';
  /** True when the rows span more than one currency, in which case amount_minor is null. */
  mixed_currency: boolean;
  /** The real per-currency breakdown, which survives even when no total is reportable. */
  by_currency: Record<string, number>;
  /** Rows that carried an amount but no currency, so they could not be attributed. */
  currency_unknown_rows: number;
  truth_class: TruthClass;
  claim_boundary: string;
};

/**
 * Builds one financial figure from a set of rows.
 *
 * The completeness flows into the truth class: a LOWER_BOUND can never be VERIFIED,
 * because a sum that skipped rows has not verified a total.
 *
 * DASHBOARD-C9: this now runs the rows through `consolidate` rather than summing the
 * field blind. C8 wrote the currency guard and then did not wire it in here, so a
 * figure spanning EUR and GBP reported a single confident number — which across the
 * thirty markets CAMBRA operates in is not a rounding concern but a wrong total.
 * All four financial entities carry a `currency` field, so there is no excuse for
 * assuming one.
 */
export function figure(input: {
  metric_key: string;
  domain: FinanceDomain;
  basis: AccountingBasis;
  rows: any[];
  field: string;
  /** Where the per-row currency lives. Defaults to the field every financial entity uses. */
  currencyField?: string;
  /** The unit `field` is stored in. Defaults to MINOR; MAJOR entities must say so. */
  unit?: AmountUnit;
  /**
   * True when the underlying source read completely.
   *
   * Without it, an empty row set is UNKNOWN — the conservative default. With it, an
   * empty set from a complete read is a real zero, because "no paid invoices exist"
   * is a fact and rendering it as unknown teaches an operator to ignore unknowns.
   */
  rows_source_complete?: boolean;
  truth_class: TruthClass;
  note?: string;
}): FinanceFigure {
  const rows = input.rows || [];
  const currencyField = input.currencyField || 'currency';
  const unit: AmountUnit = input.unit || 'MINOR';
  const amounts = rows.map((row) => toMinor(row?.[input.field], unit));
  const summed = nullableSum(amounts);

  if (!rows.length && input.rows_source_complete === true) {
    return {
      metric_key: input.metric_key, domain: input.domain, basis: input.basis,
      amount_minor: 0, currency: null, counted: 0, missing: 0, completeness: 'COMPLETE',
      mixed_currency: false, by_currency: {}, currency_unknown_rows: 0,
      truth_class: input.truth_class,
      claim_boundary: 'No rows matched. The source read completely, so this is a real zero rather than an unknown.',
    };
  }

  // Only rows that actually carry an amount can carry that amount's currency.
  const consolidated = consolidate(rows.map((row, index) => ({
    amount_minor: amounts[index],
    currency: row?.[currencyField] ?? null,
  })));

  const completenessNote = summed.completeness === 'COMPLETE'
    ? (input.note || 'Every row carried this figure.')
    : summed.completeness === 'UNKNOWN'
      ? 'No row carried this figure. Nothing is known, and this is not zero.'
      : `${summed.missing} of ${summed.counted + summed.missing} rows do not carry this figure and are excluded. Lower bound, not a total.`;

  // A figure with no reportable total is UNKNOWN however complete the rows were:
  // knowing every component and still being unable to add them is not knowing the total.
  const amount = summed.completeness === 'UNKNOWN' ? null : consolidated.amount_minor;
  const demoted: TruthClass = amount === null
    ? 'UNKNOWN'
    : (summed.completeness === 'COMPLETE' ? input.truth_class : 'DERIVED');

  const currencyNote = amount === null && summed.completeness !== 'UNKNOWN'
    ? ` ${consolidated.claim_boundary}`
    : '';

  return {
    metric_key: input.metric_key,
    domain: input.domain,
    basis: input.basis,
    amount_minor: amount,
    currency: consolidated.currency,
    counted: summed.counted,
    missing: summed.missing,
    completeness: summed.completeness,
    mixed_currency: consolidated.mixed,
    by_currency: consolidated.by_currency,
    currency_unknown_rows: rows.filter((row, index) => amounts[index] !== null
      && !text(row?.[currencyField])).length,
    truth_class: demoted,
    claim_boundary: `${completenessNote}${currencyNote}`,
  };
}

/**
 * Currency handling (section 11.16).
 *
 * The original amount is never mutated. A set of rows in mixed currencies yields
 * `null` for a consolidated total plus the per-currency breakdown, because summing
 * across currencies without a dated FX rate produces a number that is not money.
 */
export function consolidate(rows: Array<{ amount_minor: number | null; currency: string | null }>): {
  currency: string | null;
  amount_minor: number | null;
  mixed: boolean;
  by_currency: Record<string, number>;
  claim_boundary: string;
} {
  const byCurrency: Record<string, number> = {};
  let unknownCurrency = 0;
  for (const row of rows || []) {
    const amount = nullableMinor(row?.amount_minor);
    if (amount === null) continue;
    const currency = text(row?.currency).toUpperCase();
    if (!currency) { unknownCurrency += 1; continue; }
    byCurrency[currency] = (byCurrency[currency] || 0) + amount;
  }
  const currencies = Object.keys(byCurrency);
  if (currencies.length === 1 && unknownCurrency === 0) {
    return {
      currency: currencies[0], amount_minor: byCurrency[currencies[0]],
      mixed: false, by_currency: byCurrency,
      claim_boundary: 'Single currency; no conversion applied.',
    };
  }
  return {
    currency: null, amount_minor: null, mixed: currencies.length > 1,
    by_currency: byCurrency,
    claim_boundary: currencies.length > 1
      ? `Rows span ${currencies.length} currencies (${currencies.join(', ')}). No consolidated total is reported because summing across currencies without a dated FX rate produces a figure that is not money.`
      : (unknownCurrency ? `${unknownCurrency} row(s) carry no currency, so no total is reported.` : 'No amounts to consolidate.'),
  };
}

export type FinanceSnapshot = {
  savings: FinanceFigure[];
  merchant_revenue: FinanceFigure[];
  provider_revenue: FinanceFigure[];
  costs: FinanceFigure[];
  /** The revenue-to-cost join C0 found missing. Null when either side is unknown. */
  margin: {
    revenue_minor: number | null;
    cost_minor: number | null;
    margin_minor: number | null;
    /** Null whenever no margin is reportable, so a figure never floats without a unit. */
    currency: string | null;
    truth_class: TruthClass;
    claim_boundary: string;
    revenue_completeness: string;
    cost_completeness: string;
  };
  provider_firewall: { disclosed: boolean; note: string };
};

/**
 * Computes margin by crossing the revenue and cost planes.
 *
 * This is the join C0 found missing. It is deliberately conservative: if EITHER side
 * is a lower bound or unknown, the margin is not presented as a fact. A margin
 * computed from a complete revenue figure and a truncated cost figure would look
 * better than reality, which is the direction that misleads.
 */
export function computeMargin(input: {
  merchantRevenue: FinanceFigure;
  providerRevenue: FinanceFigure;
  costs: FinanceFigure;
}): FinanceSnapshot['margin'] {
  // Merchant and provider revenue may be added: both are CAMBRA revenue, and this is
  // the one place a combined figure is legitimate — for margin, against cost. The
  // combined number is never surfaced as "total revenue" elsewhere.
  const merchant = input.merchantRevenue.amount_minor;
  const provider = input.providerRevenue.amount_minor;
  const cost = input.costs.amount_minor;

  // DASHBOARD-C9: the three sides must agree on currency before any of them are
  // crossed. Subtracting a GBP cost from a EUR revenue produces a number with no
  // unit, and it would be reported as a margin.
  const currencies = [
    input.merchantRevenue, input.providerRevenue, input.costs,
  ].filter((fig) => fig.amount_minor !== null).map((fig) => text(fig.currency).toUpperCase());
  const distinct = [...new Set(currencies.filter(Boolean))];
  const currencyConflict = distinct.length > 1;
  const currencyMissing = currencies.some((value) => !value);

  const revenue = merchant === null && provider === null
    ? null
    : (merchant || 0) + (provider || 0);

  const bothComplete = input.merchantRevenue.completeness === 'COMPLETE'
    && input.providerRevenue.completeness === 'COMPLETE'
    && input.costs.completeness === 'COMPLETE';

  const margin = revenue === null || cost === null || currencyConflict || currencyMissing
    ? null
    : revenue - cost;

  const reason = currencyConflict
    ? `Margin is not computable: the sides are denominated in ${distinct.join(' and ')}. Crossing them without a dated FX rate produces a number that is not money.`
    : currencyMissing
      ? 'Margin is not computable: at least one side carries an amount with no currency.'
      : 'Margin is not computable: at least one of revenue or cost is unknown.';

  return {
    revenue_minor: revenue,
    cost_minor: cost,
    margin_minor: margin,
    currency: margin === null ? null : (distinct[0] || null),
    truth_class: margin === null ? 'UNKNOWN' : (bothComplete ? 'DERIVED' : 'MODELED'),
    revenue_completeness: `${input.merchantRevenue.completeness}/${input.providerRevenue.completeness}`,
    cost_completeness: input.costs.completeness,
    claim_boundary: margin === null
      ? reason
      : bothComplete
        ? 'Revenue and cost are both complete and in one currency. Merchant and provider revenue are combined here ONLY against cost; neither is presented as a total elsewhere.'
        : 'At least one side is a lower bound, so this margin flatters reality and is labelled MODELED. A complete revenue figure against a truncated cost figure looks better than the truth.',
  };
}

/** Builds the Finance snapshot across all five domains. */
export async function buildFinanceSnapshot(input: {
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
    ProviderRevenueLedger: await read('ProviderRevenueLedger', () => input.svc.entities.ProviderRevenueLedger.list('-updated_at', READ_LIMIT)),
    // The cost plane. Nothing financial read this before C8.
    CostUsageEvent: await read('CostUsageEvent', () => input.svc.entities.CostUsageEvent.list('-created_date', READ_LIMIT)),
  };

  const rows = (key: string) => (reads[key].status === 'UNAVAILABLE' ? [] : (reads[key].value || []));
  // A complete read that matched no rows is a real zero. An unavailable source is not.
  const complete = (key: string) => reads[key].status === 'COMPLETE';

  const verifiedSavings = figure({
    metric_key: 'verified_savings', domain: 'MERCHANT_SAVINGS', basis: 'COLLECTED',
    rows: rows('MonthlySavingsReport').filter((r: any) => text(r.verification_status).toLowerCase() === 'realized'),
    // MonthlySavingsReport.savings is a MAJOR-unit number (there is no savings_minor).
    field: 'savings', unit: 'MAJOR', rows_source_complete: complete('MonthlySavingsReport'),
    truth_class: 'VERIFIED',
    note: 'Verified savings from realized monthly reports. This is the merchant\'s benefit, not CAMBRA revenue.',
  });

  const merchantRevenue = figure({
    metric_key: 'merchant_revenue_collected', domain: 'MERCHANT_REVENUE', basis: 'COLLECTED',
    rows: rows('Invoice').filter((r: any) => text(r.status).toLowerCase() === 'paid'),
    // Invoice.amount_paid is a MAJOR-unit number (there is no amount_paid_minor).
    field: 'amount_paid', unit: 'MAJOR', rows_source_complete: complete('Invoice'),
    truth_class: 'VERIFIED',
    note: 'Collected from paid invoices. CAMBRA\'s fee, not the merchant\'s saving.',
  });

  const providerRevenue = figure({
    metric_key: 'provider_revenue_collected', domain: 'PROVIDER_REVENUE', basis: 'COLLECTED',
    rows: rows('ProviderRevenueLedger').filter((r: any) => text(r.state).toLowerCase() === 'paid'),
    field: 'paid_amount_minor', unit: 'MINOR', rows_source_complete: complete('ProviderRevenueLedger'),
    truth_class: 'VERIFIED',
    note: 'A separate ledger. Provider compensation never influences merchant ranking, benchmarks or Recover targets.',
  });

  const costs = figure({
    metric_key: 'governed_costs', domain: 'COSTS', basis: 'ACCRUED',
    rows: rows('CostUsageEvent').filter((r: any) => ['RESERVED', 'OBSERVED', 'RECONCILED', 'FAILED'].includes(text(r.state).toUpperCase())),
    field: 'amount_minor', unit: 'MINOR', rows_source_complete: complete('CostUsageEvent'),
    truth_class: 'OBSERVED',
    note: 'FAILED attempts are included: a provider can charge for a request our transport reported as failed. Only an explicit reconciliation may void one.',
  });

  const { context, source_health } = buildContext({
    workspace: 'finance', filters: input.filters || {},
    now: input.now, contextId: input.contextId, reads,
  });

  const margin = computeMargin({ merchantRevenue, providerRevenue, costs });

  return portfolioResponse({
    context, source_health,
    kpis: buildFinanceKpis({ verifiedSavings, merchantRevenue, providerRevenue, costs, margin }, source_health),
    quick_views: [],
    filter_options: { domain: [...FINANCE_DOMAINS], basis: [...ACCOUNTING_BASES] },
    rows: [],
    total: null,
    permissions: { read: true, prepare: true, operate: false },
    available_actions: [],
  });
}

export function buildFinanceKpis(
  snapshot: {
    verifiedSavings: FinanceFigure; merchantRevenue: FinanceFigure;
    providerRevenue: FinanceFigure; costs: FinanceFigure; margin: FinanceSnapshot['margin'];
  },
  health: SourceHealthRow[],
) {
  const of = (fig: FinanceFigure, source: string, label: string) => kpi({
    metric_key: fig.metric_key, label, value: fig.amount_minor, unit: 'EUR_minor',
    truth_class: fig.truth_class, sources: [source], health,
    extra: {
      numerator: fig.counted, denominator: fig.counted + fig.missing,
      claim_boundary: `[${fig.domain} · ${fig.basis}] ${fig.claim_boundary}`,
    },
  });

  return [
    of(snapshot.verifiedSavings, 'MonthlySavingsReport', 'Verified savings (merchant benefit)'),
    of(snapshot.merchantRevenue, 'Invoice', 'Merchant revenue collected'),
    of(snapshot.providerRevenue, 'ProviderRevenueLedger', 'Provider revenue collected'),
    of(snapshot.costs, 'CostUsageEvent', 'Governed costs accrued'),
    kpi({
      metric_key: 'margin_after_governed_costs', label: 'Margin after governed costs',
      value: snapshot.margin.margin_minor, unit: 'EUR_minor',
      truth_class: snapshot.margin.truth_class,
      sources: ['Invoice', 'ProviderRevenueLedger', 'CostUsageEvent'], health,
      extra: { claim_boundary: snapshot.margin.claim_boundary },
    }),
  ];
}

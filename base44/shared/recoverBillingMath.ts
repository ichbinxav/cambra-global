// recoverBillingMath — RECOVER-4 (2026-08-04).
//
// ALL Recover Margin money math lives here, in INTEGER MINOR UNITS (euro cents).
// No float ever represents an invoiced amount: floats enter once (the stored
// EUR figures), are converted to cents with a single explicit rounding, and
// everything downstream is integer arithmetic.
//
// ROUNDING POLICY (documented per §10 of the RECOVER-4 spec):
//   1. billable savings  = max(savings, 0), rounded to cents (half-up).
//   2. fee net           = round_half_up(savings_minor × effective_fee_pct / 100).
//   3. tax               = round_half_up(fee_net_minor × tax_rate_bps / 10000),
//                          computed on the ALREADY-ROUNDED net fee.
//   4. total             = fee_net_minor + tax_minor (pure integer sum).
// Deterministic: same inputs → same cents, always.

export const RECOVER_CALCULATION_VERSION = 'recover4-calc-v1';

/** EUR number → integer cents, half-up. Rejects non-finite input. */
export function eurToMinor(eur: unknown): number {
  const n = Number(eur);
  if (!Number.isFinite(n)) throw new Error('amount_not_finite');
  // Scale via string-free epsilon guard: 19.995 * 100 = 1999.4999… in IEEE754.
  return Math.round((n + Math.sign(n) * Number.EPSILON * Math.abs(n)) * 100);
}

export function minorToEur(minor: number): number {
  return Math.round(minor) / 100;
}

/** round_half_up for a non-negative rational num/den in integer space. */
function divRoundHalfUp(num: number, den: number): number {
  return Math.floor((num + den / 2) / den);
}

/** Fee net of tax, in cents. pct is a percentage like 25 or 12.5. */
export function feeNetMinor(billableSavingsMinor: number, effectiveFeePct: number): number {
  if (billableSavingsMinor <= 0) return 0;
  const pctBps = Math.round(effectiveFeePct * 100); // 25 → 2500 bps
  if (pctBps <= 0) return 0;
  return divRoundHalfUp(billableSavingsMinor * pctBps, 10000);
}

/** Tax in cents on the already-rounded net fee. rateBps: 2000 = 20%. */
export function taxMinor(feeNetMinorAmount: number, rateBps: number): number {
  if (feeNetMinorAmount <= 0 || rateBps <= 0) return 0;
  return divRoundHalfUp(feeNetMinorAmount * rateBps, 10000);
}

export type InvoiceAmounts = {
  calculation_version: string;
  savings_minor: number;
  billable_savings_minor: number;
  standard_fee_pct: number;
  discount_pct: number;
  effective_fee_pct: number;
  fee_net_minor: number;
  tax_rate_bps: number;
  tax_minor: number;
  total_minor: number;
  // EUR mirrors for the legacy Invoice fields (subtotal/tax/total).
  fee_net_eur: number;
  tax_eur: number;
  total_eur: number;
  billable_savings_eur: number;
};

/**
 * The one composition every Recover invoice uses. The 25% (or discounted pct)
 * is applied to the NET verified savings — never to a tax-inclusive amount
 * (§5): tax enters only AFTER the fee is computed and rounded.
 */
export function computeInvoiceAmounts(input: {
  savings_eur: number;
  standard_fee_pct: number;
  effective_fee_pct: number;
  tax_rate_bps: number;
}): InvoiceAmounts {
  const savingsMinor = eurToMinor(input.savings_eur);
  const billableMinor = Math.max(savingsMinor, 0);
  const fee = feeNetMinor(billableMinor, input.effective_fee_pct);
  const tax = taxMinor(fee, input.tax_rate_bps);
  const total = fee + tax;
  const discount = Math.max(input.standard_fee_pct - input.effective_fee_pct, 0);
  return {
    calculation_version: RECOVER_CALCULATION_VERSION,
    savings_minor: savingsMinor,
    billable_savings_minor: billableMinor,
    standard_fee_pct: input.standard_fee_pct,
    discount_pct: discount,
    effective_fee_pct: input.effective_fee_pct,
    fee_net_minor: fee,
    tax_rate_bps: input.tax_rate_bps,
    tax_minor: tax,
    total_minor: total,
    fee_net_eur: minorToEur(fee),
    tax_eur: minorToEur(tax),
    total_eur: minorToEur(total),
    billable_savings_eur: minorToEur(billableMinor),
  };
}

// ── Contractual calendar (§6–§7) ─────────────────────────────────────────────
// Contractual timezone: dates are compared as calendar dates in Europe/Paris.
// conditions_activated_at is stored as an ISO instant; its Paris calendar date
// determines the activation month.

const PARIS_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });

/** ISO instant → 'YYYY-MM' in Europe/Paris. */
export function parisMonthOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error('invalid_date');
  return PARIS_FMT.format(d).slice(0, 7); // en-CA → YYYY-MM-DD
}

function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const t = (y * 12 + (m - 1)) + n;
  const ny = Math.floor(t / 12);
  const nm = (t % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

/** First full calendar month after activation = first measured month (§7). */
export function firstMeasurementMonth(conditionsActivatedAtIso: string): string {
  return addMonths(parisMonthOf(conditionsActivatedAtIso), 1);
}

/** 24 contractual months of measured periods: last billable month. */
export function lastMeasurementMonth(conditionsActivatedAtIso: string): string {
  return addMonths(firstMeasurementMonth(conditionsActivatedAtIso), 23);
}

/** agreement_end_at: end of the 24th measured month (Paris), as ISO instant. */
export function agreementEndAt(conditionsActivatedAtIso: string): string {
  const last = lastMeasurementMonth(conditionsActivatedAtIso);
  const [y, m] = last.split('-').map(Number);
  // Last instant of that month in UTC terms of the following month start; we
  // store the first instant of the following Paris month minus 1s is overkill —
  // the calendar comparisons all happen at month granularity via the helpers
  // above, so the stored instant is informative, not load-bearing.
  return new Date(Date.UTC(y, m, 1, 0, 0, 0)).toISOString();
}

export type MonthEligibility =
  | { billable: true }
  | { billable: false; reason: 'activation_month_not_billable' | 'before_first_measured_month' | 'after_agreement_end' | 'month_not_closed' };

/** Is `month` (YYYY-MM) a billable measured period? `now` for testability. */
export function monthBillableWindow(
  month: string,
  conditionsActivatedAtIso: string,
  now: Date = new Date(),
): MonthEligibility {
  const first = firstMeasurementMonth(conditionsActivatedAtIso);
  const last = lastMeasurementMonth(conditionsActivatedAtIso);
  const activationMonth = parisMonthOf(conditionsActivatedAtIso);
  if (month === activationMonth) return { billable: false, reason: 'activation_month_not_billable' };
  if (month < first) return { billable: false, reason: 'before_first_measured_month' };
  if (month > last) return { billable: false, reason: 'after_agreement_end' };
  const currentMonth = PARIS_FMT.format(now).slice(0, 7);
  if (month >= currentMonth) return { billable: false, reason: 'month_not_closed' };
  return { billable: true };
}

/** Deterministic JSON + SHA-256, same convention as recoverAcceptance. */
function stableStringify(value: any): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

export async function hashCalculation(payload: any): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringify(payload));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}
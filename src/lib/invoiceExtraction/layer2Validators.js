/**
 * CAMBRA — Invoice extraction, Layer 2: deterministic validators.
 *
 * This module exists to catch the LLM lying, hallucinating, or mis-parsing
 * units. It is pure JavaScript, zero LLM calls, zero I/O — the whole point
 * is that it is fully testable and cannot itself invent numbers.
 *
 * Layer 2 sits between:
 *   - Layer 1 (LLM extraction from a document — may be wrong or made up)
 *   - Layer 3 (cross-check with a second model — may agree with a lie)
 *
 * If Layer 2 rejects a value, the value NEVER enters scoreEngine. The upload
 * flow continues, but that specific field is marked as unavailable rather
 * than filled with a fabricated number. This is the module that enforces
 * the "an invalid number is worse than no number" rule.
 *
 * Everything exported here is a small named function so each rule can be
 * covered by an isolated unit test. No rule reads from Layer 1's `confidence`
 * — a confident LLM saying 34 % processing fee still gets rejected.
 */

// ─── Provider-aware plausible ranges for the effective processing rate ───────
// Effective rate = fees / gross_volume * 100. Values are % (not decimals).
// Ranges are deliberately generous on the low end (network deals) and tight
// on the high end (a rate above ~6 % is basically always a parsing bug).
// Sources: Stripe/Adyen/Mollie/SumUp published rate cards; PSD2 caps for EU.
const PROVIDER_RATE_RANGES = {
  stripe:            { min: 1.2, max: 3.5 },
  adyen:             { min: 0.8, max: 3.5 },
  mollie:            { min: 1.2, max: 3.5 },
  paypal:            { min: 1.9, max: 4.5 },
  klarna:            { min: 1.9, max: 5.5 },
  square:            { min: 1.4, max: 3.5 },
  braintree:         { min: 1.2, max: 3.5 },
  "checkout.com":    { min: 1.0, max: 3.5 },
  worldpay:          { min: 1.0, max: 3.5 },
  "shopify payments":{ min: 1.4, max: 3.5 },
  sumup:             { min: 1.4, max: 3.5 },
};

// Fallback: if no provider was detected, use a broad plausible range.
// Anything below 0.3 % or above 6 % is treated as impossible regardless of
// what the LLM claimed.
const GENERIC_RATE_RANGE = { min: 0.3, max: 6.0 };

// Shipping cost per shipment sanity: EU averages sit in the €3.50–€9 band for
// domestic. Below €1.5 is almost certainly a units bug (missing shipments or
// cents-as-euros); above €40 is almost certainly a bill total misread as a
// per-shipment cost.
const SHIPPING_PER_UNIT_RANGE = { min: 1.5, max: 40 };

/** Normalize a provider label to the key we use in PROVIDER_RATE_RANGES. */
function normalizeProvider(provider) {
  if (!provider || typeof provider !== "string") return "";
  return provider.trim().toLowerCase();
}

/** True if the argument is a finite, non-NaN number. */
function isFiniteNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}

// ─── Rule 1 — the implied processing rate must fall in a plausible band ─────
/**
 * Check the ratio implied by (fees / gross_volume) against provider-aware
 * bounds. Rejects both "34 % processing fee" (a decimal-point / cents bug)
 * and "0.01 %" (a currency-scale bug in the other direction).
 *
 * Returns:
 *   { passed: true }                                — ratio is plausible
 *   { passed: false, reason: string, ratio: number } — rejected, with a
 *     human-readable reason that surfaces to the audit trail.
 *
 * Notes:
 *   - Missing inputs (null / undefined / 0 volume) return {passed:false}
 *     because we cannot compute a ratio — better absent than assumed.
 *   - Provider match is best-effort; unknown provider falls back to the
 *     GENERIC_RATE_RANGE. We NEVER widen the range just because the LLM
 *     was very confident.
 */
export function validateProcessingRateRange({ fees, gross_volume, provider }) {
  if (!isFiniteNumber(fees) || !isFiniteNumber(gross_volume)) {
    return { passed: false, reason: "missing_or_non_numeric_inputs" };
  }
  if (gross_volume <= 0) {
    return { passed: false, reason: "zero_or_negative_volume" };
  }
  if (fees < 0) {
    return { passed: false, reason: "negative_fees" };
  }

  const ratio = (fees / gross_volume) * 100;
  const key = normalizeProvider(provider);
  const range = PROVIDER_RATE_RANGES[key] || GENERIC_RATE_RANGE;

  if (ratio < range.min) {
    return { passed: false, reason: "ratio_below_plausible_range", ratio, range };
  }
  if (ratio > range.max) {
    return { passed: false, reason: "ratio_above_plausible_range", ratio, range };
  }
  return { passed: true, ratio, range };
}

// ─── Rule 2 — cents-vs-euros detection (100x scale mismatch) ────────────────
/**
 * A very common LLM/OCR failure mode: reading a €12,345.67 total from a PDF
 * that stored the value as 1234567 (cents) and returning 1_234_567 as if it
 * were euros. Or the reverse — dividing a euros value by 100 because the
 * model saw "in cents" somewhere on the page.
 *
 * We detect this by checking whether *either* dividing the extracted number
 * by 100 *or* multiplying by 100 lands inside the plausible band, while the
 * value itself does not. When that happens the correct answer is NOT to
 * silently fix it — it is to reject the number and flag it, because we
 * cannot know which correction the source intended.
 *
 * Parameters:
 *   value        — the number Layer 1 extracted (in whatever unit it claimed)
 *   plausibleMin — lower bound the value is expected to sit in (same unit)
 *   plausibleMax — upper bound the value is expected to sit in (same unit)
 *
 * Returns:
 *   { passed: true }                                  — value is inside band
 *   { passed: false, reason: "in_range" }             — ONLY when band is wrong
 *   { passed: false, reason: "likely_units_100x", direction: "cents_as_euros"|"euros_as_cents" }
 *   { passed: false, reason: "out_of_band" }          — off but not by 100x
 */
export function validateNoUnitsScaleError({ value, plausibleMin, plausibleMax }) {
  if (!isFiniteNumber(value)) {
    return { passed: false, reason: "non_numeric_value" };
  }
  if (!isFiniteNumber(plausibleMin) || !isFiniteNumber(plausibleMax)) {
    return { passed: false, reason: "invalid_bounds" };
  }
  if (plausibleMin > plausibleMax) {
    return { passed: false, reason: "invalid_bounds" };
  }

  if (value >= plausibleMin && value <= plausibleMax) {
    return { passed: true };
  }

  const dividedBy100 = value / 100;
  const timesBy100 = value * 100;

  if (dividedBy100 >= plausibleMin && dividedBy100 <= plausibleMax) {
    // Extracted value is roughly 100x too big for the band → likely cents
    // were read as if they were euros.
    return { passed: false, reason: "likely_units_100x", direction: "cents_as_euros" };
  }
  if (timesBy100 >= plausibleMin && timesBy100 <= plausibleMax) {
    // Extracted value is roughly 100x too small → likely euros were read
    // as if they were cents.
    return { passed: false, reason: "likely_units_100x", direction: "euros_as_cents" };
  }

  return { passed: false, reason: "out_of_band" };
}

// ─── Rule 3 — shipping cost per unit sanity ──────────────────────────────────
/**
 * Called with the average shipping cost per shipment implied by the extracted
 * (total_cost, shipment_count). Rejects €0.40/shipment (units bug) and
 * €80/shipment (total misread as per-unit). Doesn't try to reason about
 * international vs domestic — that's beyond what Layer 2 should do; we only
 * catch obviously impossible values.
 */
export function validateShippingCostPerUnit({ total_cost, shipment_count }) {
  if (!isFiniteNumber(total_cost) || !isFiniteNumber(shipment_count)) {
    return { passed: false, reason: "missing_or_non_numeric_inputs" };
  }
  if (shipment_count <= 0) {
    return { passed: false, reason: "zero_or_negative_count" };
  }
  if (total_cost < 0) {
    return { passed: false, reason: "negative_cost" };
  }

  const perUnit = total_cost / shipment_count;
  if (perUnit < SHIPPING_PER_UNIT_RANGE.min) {
    return { passed: false, reason: "per_unit_below_plausible_range", perUnit, range: SHIPPING_PER_UNIT_RANGE };
  }
  if (perUnit > SHIPPING_PER_UNIT_RANGE.max) {
    return { passed: false, reason: "per_unit_above_plausible_range", perUnit, range: SHIPPING_PER_UNIT_RANGE };
  }
  return { passed: true, perUnit };
}

// ─── Rule 4 — SaaS monthly spend sanity vs monthly revenue ──────────────────
/**
 * SaaS spend > monthly revenue is a strong signal that either (a) an annual
 * subscription was misread as monthly, or (b) revenue is missing / wrong.
 * Either way it's not a number we want feeding scoreEngine.
 *
 * Also catches the classic "total_saas_spend = 0.05" (someone read a % as a
 * spend amount).
 */
export function validateSaasSpendVsRevenue({ monthly_saas_spend, monthly_revenue }) {
  if (!isFiniteNumber(monthly_saas_spend)) {
    return { passed: false, reason: "non_numeric_spend" };
  }
  if (monthly_saas_spend < 0) {
    return { passed: false, reason: "negative_spend" };
  }
  // If we don't know revenue we cannot cross-check — treat as unverifiable.
  if (!isFiniteNumber(monthly_revenue) || monthly_revenue <= 0) {
    return { passed: false, reason: "no_revenue_context" };
  }
  if (monthly_saas_spend > monthly_revenue) {
    return { passed: false, reason: "saas_exceeds_revenue" };
  }
  // A "spend" under €1/month is almost certainly a % misread.
  if (monthly_saas_spend > 0 && monthly_saas_spend < 1) {
    return { passed: false, reason: "implausibly_small_spend" };
  }
  return { passed: true };
}

// ─── High-level combinator ──────────────────────────────────────────────────
/**
 * Run every applicable rule for a payments extraction and return a per-field
 * verdict. Each field is either kept (value + high confidence) or dropped
 * with a reason. The dropped fields still appear in the verdict so the audit
 * trail can show "we saw X, but rejected it because Y".
 *
 * Input shape (all optional — missing fields are simply not validated):
 *   {
 *     provider: string,
 *     fees:          number,   // total processing fees in the period
 *     gross_volume:  number,   // total gross volume in the period
 *     shipping_total_cost: number,
 *     shipping_shipment_count: number,
 *     monthly_saas_spend: number,
 *     monthly_revenue:    number   // context, not extracted — passed in
 *   }
 */
export function runLayer2({
  provider = "",
  fees,
  gross_volume,
  shipping_total_cost,
  shipping_shipment_count,
  monthly_saas_spend,
  monthly_revenue,
} = {}) {
  const results = {
    fees_and_volume: null,
    shipping_per_unit: null,
    saas_spend: null,
  };

  const payments_run = isFiniteNumber(fees) || isFiniteNumber(gross_volume);
  if (payments_run) {
    results.fees_and_volume = validateProcessingRateRange({ fees, gross_volume, provider });
  }

  const shipping_run = isFiniteNumber(shipping_total_cost) || isFiniteNumber(shipping_shipment_count);
  if (shipping_run) {
    results.shipping_per_unit = validateShippingCostPerUnit({
      total_cost: shipping_total_cost,
      shipment_count: shipping_shipment_count,
    });
  }

  const saas_run = isFiniteNumber(monthly_saas_spend);
  if (saas_run) {
    results.saas_spend = validateSaasSpendVsRevenue({ monthly_saas_spend, monthly_revenue });
  }

  const anyRejected = Object.values(results).some(v => v && v.passed === false);
  return { results, anyRejected };
}

// Expose ranges for use by tests + by the extractor's audit log — never for
// widening bounds at runtime based on LLM output.
export const RANGES = {
  PROVIDER_RATE_RANGES,
  GENERIC_RATE_RANGE,
  SHIPPING_PER_UNIT_RANGE,
};
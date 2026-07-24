// ─────────────────────────────────────────────────────────────────────────────
// paymentsBenchmark — pure presentation helper for Report v2, Pieza C
// (peer distribution "WHERE YOU STAND VS BRANDS LIKE YOU").
//
// HONESTY (hard rule from the operator):
//   The curve is MODELED from public pricing data — NOT a measured cohort
//   distribution. The component MUST render the modeled-note under the curve
//   and keep the "~" on every percentile. We never present the percentile as
//   a real measured distribution. The median is NEVER moved to serve the
//   narrative — only evidence moves it (SWEEP-1 T6 decision, 2026-07-24).
//
// TWO MODES:
//
// 1) DERIVED (preferred) — when the caller passes the active PaymentsRateTable
//    rows (opts.rateTable) plus the merchant's country (opts.country), the
//    curve parameters are DERIVED from the public pricing rows of the
//    merchant's region+channel(+country pin):
//      · each matching row → its effective bps at a FIXED reference point
//        (reference ticket + reference in-store GMV — merchant-independent
//        by construction, see constants below)
//      · median of those rates → curve median (peer median marker)
//      · min → curve floor (Top 10% marker = best publicly contractable)
//      · max → curve ceiling; sd sized so the ceiling sits ≈2σ above the
//        median → the expensive tail differentiates (a 2.9% and a 4.5%
//        merchant no longer read the same)
//    MONOTONICITY GUARANTEE (T6 acceptance criterion): parameters depend ONLY
//    on (region, channel, country) — never on the merchant's own inputs — so
//    within the same country+channel, a lower effective rate ALWAYS yields an
//    equal-or-better percentile (Gaussian CDF is monotone in x for fixed
//    mean/sd). The pre-T6 inversion (ES in-store 1.08% → "92%" vs 1.49% →
//    "99%") came from anchoring the median to EACH merchant's own
//    achievable_effective_bps — different provider ⇒ different curve.
//
// 2) MODELED FALLBACK (legacy) — when no rateTable is supplied or fewer than
//    MIN_ROWS rows match, the previous constant-based model runs unchanged
//    (median = achievable + MEDIAN_FRAC·(ceiling − achievable)). Flagged
//    derived:false — "modeled, pending verified data". NOTE: this path keeps
//    the merchant-anchored parameters and therefore the monotonicity caveat;
//    it only runs when a curve cannot be derived honestly.
//
// MODE SEAM: opts.mode === "vs_cohort" remains RESERVED for when real cohort
//   data exists (sufficient N of verified merchants).
// ─────────────────────────────────────────────────────────────────────────────

// Same absolute market ceiling the Score uses (fallback mode only).
const DEFAULT_CEILING_BPS = 310;

// Fallback mode only — where the modeled median sits between floor and ceiling.
const MEDIAN_FRAC = 0.42;

// DERIVED mode — fixed reference amortization points. These are documented
// assumptions (Decision_Log_SWEEP1 T6), NOT tuned to the merchant: using the
// merchant's own ticket/GMV here would re-introduce per-merchant curves and
// break monotonicity.
//   REF_TICKET_EUR: typical ICP ticket per channel (online basket / in-store).
//   REF_INSTORE_GMV: monthly in-store card GMV used to amortize terminal
//   rentals & subscription plans (≈ €150k/yr, mid of the ICP band).
const REF_TICKET_EUR = { online: 50, in_store: 35 };
const REF_INSTORE_GMV_EUR_MONTHLY = 12500;
const MIN_ROWS = 3;

// Gaussian CDF (Abramowitz & Stegun 7.1.26 approximation of erf).
function normalCdf(x, mean, sd) {
  if (sd <= 0) return x >= mean ? 1 : 0;
  const z = (x - mean) / (sd * Math.SQRT2);
  // erf
  const t = 1 / (1 + 0.3275911 * Math.abs(z));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  const erf = z >= 0 ? y : -y;
  return 0.5 * (1 + erf);
}

// One rate-table row → its effective bps at the fixed reference point.
function rowEffectiveBps(row, channel) {
  const pct = Number(row?.percent_bps);
  if (!isFinite(pct) || pct <= 0) return null;
  const ticketMinor = (REF_TICKET_EUR[channel] || REF_TICKET_EUR.online) * 100;
  const fixed = Number(row?.fixed_fee_minor_units) || 0;
  let eff = pct + (fixed / ticketMinor) * 10000;
  if (channel === "in_store") {
    const rental = Number(row?.terminal_rental_monthly_minor) || 0;
    eff += (rental / (REF_INSTORE_GMV_EUR_MONTHLY * 100)) * 10000;
  }
  return eff;
}

// Derive curve parameters for one (region, channel, country) — or null when
// the table can't support an honest derivation.
function deriveCurveParams(rateTable, { channel, region, country }) {
  if (!Array.isArray(rateTable) || !region) return null;
  const rates = [];
  for (const row of rateTable) {
    if (row?.active === false) continue;
    if ((row?.channel || "online") !== channel) continue;
    if (row?.region !== region) continue;
    // Country-pinned rows only apply to their own country; pan-regional rows
    // apply everywhere (same semantics as the engine's selectRow).
    if (row?.country && row.country !== country) continue;
    const eff = rowEffectiveBps(row, channel);
    if (eff != null) rates.push(eff);
  }
  if (rates.length < MIN_ROWS) return null;
  rates.sort((a, b) => a - b);
  const mid = Math.floor(rates.length / 2);
  const median = rates.length % 2 ? rates[mid] : (rates[mid - 1] + rates[mid]) / 2;
  const floor = rates[0];
  const max = rates[rates.length - 1];
  // sd sized from the data spread: floor ≈2σ below AND ceiling ≈2σ above,
  // whichever is wider (min 12bps guard). Wider than the legacy constant →
  // the expensive tail differentiates instead of saturating at ~1%.
  const sd = Math.max((median - floor) / 2, (max - median) / 2, 12);
  return { floor, median, max, sd, n: rates.length };
}

// computePaymentsBenchmark — derive the peer distribution.
//
// opts: { rateTable?: PaymentsRateTable rows, country?: ISO-2, ceilingBps?, mode? }
//
// Returns:
//   { available: false }                                   // can't build honestly
//   { available: true, mode, derived, illustrative: true,
//     axis: { minBps, maxBps },                            // x-axis domain (bps)
//     markers: { top10Bps, medianBps, youBps },            // marker positions (bps)
//     distribution: { meanBps, sdBps },                    // bell params (bps)
//     expensivePct, cheaperSide, cheaperPct,
//     basis }                                              // derivation audit (derived mode)
export function computePaymentsBenchmark(engineResult, opts = {}) {
  const current = Number(engineResult?.current_effective_bps);
  const achievable = Number(engineResult?.achievable_effective_bps);

  if (!isFinite(current) || !isFinite(achievable) || achievable <= 0) {
    return { available: false };
  }

  // Cohort context — region+channel come from the engine's cohort, country
  // from the caller (input snapshot). Region part may carry an "-CC" suffix
  // (M5 key convention) — strip it; the country pin is field-based.
  const channel = engineResult?.cohort?.channel === "in_store" ? "in_store" : "online";
  const regionPart = String(engineResult?.cohort?.key || "").split("|")[2] || "";
  const region = regionPart.split("-")[0] || null;
  const country = opts.country ? String(opts.country).toUpperCase() : null;

  // ── DERIVED mode ─────────────────────────────────────────────────────────
  const params = deriveCurveParams(opts.rateTable, { channel, region, country });
  if (params) {
    const { floor, median, max, sd, n } = params;
    const span = Math.max(max - floor, 40);
    const minBps = Math.min(floor, current) - span * 0.12;
    const maxBps = Math.max(max, current) + span * 0.12;

    const upperTail = 1 - normalCdf(current, median, sd);
    const expensivePct = Math.max(1, Math.min(99, Math.round(upperTail * 100)));
    const cheaperSide = current <= median;
    const cheaperPct = Math.max(1, Math.min(99, expensivePct));

    return {
      available: true,
      mode: "derived_public_pricing",
      derived: true,
      illustrative: true, // still modeled, not a measured cohort
      axis: { minBps, maxBps },
      markers: { top10Bps: floor, medianBps: median, youBps: current },
      distribution: { meanBps: median, sdBps: sd },
      expensivePct,
      cheaperSide,
      cheaperPct,
      basis: { n, floorBps: floor, medianBps: median, maxBps: max, region, channel, country },
    };
  }

  // ── MODELED FALLBACK (legacy, unchanged math) ────────────────────────────
  const ceiling = isFinite(Number(opts.ceilingBps)) && Number(opts.ceilingBps) > achievable
    ? Number(opts.ceilingBps)
    : DEFAULT_CEILING_BPS;

  const top10Bps = achievable;
  const medianBps = achievable + MEDIAN_FRAC * (ceiling - achievable);

  const span = ceiling - achievable;
  const minBps = achievable - span * 0.12;
  const maxBps = Math.max(ceiling, current) + span * 0.12;

  const sdBps = Math.max(1, (medianBps - achievable) / 2);

  const upperTail = 1 - normalCdf(current, medianBps, sdBps);
  const expensivePct = Math.max(1, Math.min(99, Math.round(upperTail * 100)));
  const cheaperSide = current <= medianBps;
  const cheaperPct = Math.max(1, Math.min(99, expensivePct));

  return {
    available: true,
    mode: "illustrative",
    derived: false,
    illustrative: true,
    axis: { minBps, maxBps },
    markers: { top10Bps, medianBps, youBps: current },
    distribution: { meanBps: medianBps, sdBps },
    expensivePct,
    cheaperSide,
    cheaperPct,
  };
}

export { DEFAULT_CEILING_BPS, MEDIAN_FRAC, REF_TICKET_EUR, REF_INSTORE_GMV_EUR_MONTHLY };
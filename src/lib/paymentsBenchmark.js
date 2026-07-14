// ─────────────────────────────────────────────────────────────────────────────
// paymentsBenchmark — pure presentation helper for Report v2, Pieza C
// (peer distribution "WHERE YOU STAND VS BRANDS LIKE YOU").
//
// HONESTY (hard rule from the operator):
//   The cohort is thin today, so this benchmark is ILLUSTRATIVE / ESTIMATED —
//   NOT a measured percentile. The component MUST render the "illustrative ·
//   cohort growing" label. We never present the percentile as a real measured
//   distribution.
//
// ANCHORING (all derived from numbers the engine already produced — no new
// engine, no rate-table read, ZERO imports):
//   Top 10%      ≈ achievable_effective_bps   (the achievable floor)
//   Peer median  ≈ mid-market, modeled as achievable + MEDIAN_FRAC * (ceiling − achievable)
//   YOU          = current_effective_bps       (the merchant's REAL rate)
//   Ceiling      = DEFAULT_CEILING_BPS (same absolute market ceiling as the Score)
//
// PERCENTILE: an ESTIMATE. We model the cohort as a Gaussian centered on the
//   peer median, then compute "you're in the most expensive ~X% of brands"
//   as the upper-tail mass beyond YOU's rate. Purely illustrative.
//
// MODE SEAM: opts.mode === "vs_cohort" is RESERVED for when real cohort data
//   exists (sufficient N). Passing it today falls back to "illustrative" and
//   reports the mode that actually ran — same pattern as computePaymentsScore,
//   so the component never needs rewriting when the real distribution ships.
// ─────────────────────────────────────────────────────────────────────────────

// Same absolute market ceiling the Score uses (kept in sync manually — both are
// presentation-layer calibration, not engine constants).
const DEFAULT_CEILING_BPS = 310;

// Where the peer median sits between the floor and the ceiling (illustrative).
// 0.42 → median a touch below mid, matching that most brands cluster nearer the
// mainstream rack rate than the negotiated floor.
const MEDIAN_FRAC = 0.42;

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

// computePaymentsBenchmark — derive the illustrative peer distribution.
//
// Returns:
//   { available: false }                                   // can't build honestly
//   { available: true, mode, illustrative: true,
//     axis: { minBps, maxBps },                            // x-axis domain (bps)
//     markers: { top10Bps, medianBps, youBps },            // marker positions (bps)
//     distribution: { meanBps, sdBps },                    // bell params (bps)
//     expensivePct }                                       // "most expensive ~X%"
export function computePaymentsBenchmark(engineResult, opts = {}) {
  const current = Number(engineResult?.current_effective_bps);
  const achievable = Number(engineResult?.achievable_effective_bps);

  if (!isFinite(current) || !isFinite(achievable) || achievable <= 0) {
    return { available: false };
  }

  const ceiling = isFinite(Number(opts.ceilingBps)) && Number(opts.ceilingBps) > achievable
    ? Number(opts.ceilingBps)
    : DEFAULT_CEILING_BPS;

  const top10Bps = achievable;
  const medianBps = achievable + MEDIAN_FRAC * (ceiling - achievable);

  // Axis domain — pad a little below the floor and above the ceiling so the
  // curve tails have room and a very-expensive YOU still lands inside.
  const span = ceiling - achievable;
  const minBps = achievable - span * 0.12;
  const maxBps = Math.max(ceiling, current) + span * 0.12;

  // Bell modeled around the peer median. SD chosen so the floor sits ~2σ below
  // the median (top brands are a genuine tail) and the ceiling ~1.5σ above.
  const sdBps = Math.max(1, (medianBps - achievable) / 2);

  // "You're in the most expensive ~X%": upper-tail mass beyond YOU.
  const upperTail = 1 - normalCdf(current, medianBps, sdBps);
  const expensivePct = Math.max(1, Math.min(99, Math.round(upperTail * 100)));

  // vs_cohort reserved for real-N mode; today always illustrative.
  const mode = "illustrative";

  return {
    available: true,
    mode,
    illustrative: true,
    axis: { minBps, maxBps },
    markers: { top10Bps, medianBps, youBps: current },
    distribution: { meanBps: medianBps, sdBps },
    expensivePct,
  };
}

export { DEFAULT_CEILING_BPS, MEDIAN_FRAC };
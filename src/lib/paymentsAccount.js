// paymentsAccount — pure derivation of an ACCOUNT-LEVEL aggregate from all of a
// brand's AnalyzerResult rows (Phase 2 · dashboard: cuenta / agregado).
//
// SAME GUARDAS as paymentsInsights.js:
//   • Payments only. No fabrication. ONE source: every number derives from the
//     persisted engine_result / input_snapshot on each AnalyzerResult — never
//     recomputed against a different model.
//   • Coherence: the aggregate must be internally consistent —
//       total_fees_annual === Σ (per-analysis fees)   (SUM validated)
//       effective_bps     === weighted by annual GMV   (not a naive average)
//     A `_coherent` flag is returned so the UI can refuse to render an
//     aggregate that fails its own sum check (honest over pretty).
//   • `available: false` when there's nothing to aggregate.
//
// Pure function of plain inputs. No SDK, no side effects.

const BPS_PER_UNIT = 10000;
const num = (v) => (isFinite(Number(v)) ? Number(v) : null);
const bpsToPct = (bps) => (isFinite(bps) ? bps / 100 : null);

// Confidence precedence — the account is only as strong as its strongest
// analysis (a verified analysis proves the account has real data behind it).
const CONFIDENCE_RANK = { verified: 3, pending_verification: 2, estimated: 1 };

// Pull the fields we need from one AnalyzerResult, defensively. Returns null
// when the row lacks the payments engine shape (legacy scoreEngine rows).
function readAnalysis(row) {
  const er = row?.details?.engine_result || null;
  const snap = row?.details?.input_snapshot || {};
  if (!er) return null;

  const currentBps = num(er.current_effective_bps);
  const monthlyGmv = num(snap.monthly_gmv_eur);
  if (currentBps == null || monthlyGmv == null) return null;

  const annualGmv = monthlyGmv * 12;
  const annualFees = annualGmv * (currentBps / BPS_PER_UNIT);
  const annualSavingsPoint =
    num(er?.annual_savings_eur?.point) ?? num(row?.total_savings) ?? 0;

  return {
    id: row.id,
    created_date: row.created_date,
    verification_status: row.verification_status || "estimated",
    provider_slug: snap.provider_slug || null,
    country: snap.country || null,
    channel: er?.cohort?.channel === "in_store" ? "in_store" : "online",
    current_bps: currentBps,
    monthly_gmv: monthlyGmv,
    annual_gmv: annualGmv,
    annual_fees: annualFees,
    annual_savings: Math.max(0, annualSavingsPoint),
  };
}

// Aggregate an array of AnalyzerResult rows into a single account view.
//
// NOTE on multi-channel: online and in-store analyses are aggregated together
// at the money level (total GMV, total fees, total savings) because those are
// additive euros. The blended effective rate is GMV-weighted across all
// channels — a true account-wide "what fraction of everything you process goes
// to fees". `channels` lists which channels contributed so the UI can label it.
export function derivePaymentsAccount(rows) {
  const analyses = (Array.isArray(rows) ? rows : [])
    .map(readAnalysis)
    .filter(Boolean);

  if (analyses.length === 0) {
    return { available: false, count: 0 };
  }

  // Money aggregates — plain sums (additive euros).
  let totalAnnualGmv = 0;
  let totalAnnualFees = 0;
  let totalAnnualSavings = 0;
  let bestConfidence = "estimated";
  const channelsSet = new Set();
  const providersSet = new Set();
  const countriesSet = new Set();

  for (const a of analyses) {
    totalAnnualGmv += a.annual_gmv;
    totalAnnualFees += a.annual_fees;
    totalAnnualSavings += a.annual_savings;
    channelsSet.add(a.channel);
    if (a.provider_slug) providersSet.add(a.provider_slug);
    if (a.country) countriesSet.add(a.country);
    if ((CONFIDENCE_RANK[a.verification_status] || 0) > (CONFIDENCE_RANK[bestConfidence] || 0)) {
      bestConfidence = a.verification_status;
    }
  }

  // GMV-weighted blended effective rate (bps). Guard against zero GMV.
  const blendedBps = totalAnnualGmv > 0 ? (totalAnnualFees / totalAnnualGmv) * BPS_PER_UNIT : null;

  // ── COHERENCE (SUM validated before the UI is allowed to show it) ──
  // The aggregate total fees must equal fees reconstructed from the blended
  // rate on total GMV (they should be arithmetically identical). Tolerate €1
  // of float rounding across many rows.
  const reconstructedFees = blendedBps != null ? totalAnnualGmv * (blendedBps / BPS_PER_UNIT) : null;
  const coherent =
    reconstructedFees != null && Math.abs(reconstructedFees - totalAnnualFees) <= 1;

  return {
    available: true,
    count: analyses.length,
    analyses,                              // sorted as passed in (newest first)
    total_annual_gmv: totalAnnualGmv,
    total_annual_fees: totalAnnualFees,
    total_annual_savings: totalAnnualSavings,
    blended_effective_bps: blendedBps,
    blended_effective_pct: bpsToPct(blendedBps),
    confidence: bestConfidence,            // verified | pending_verification | estimated
    channels: Array.from(channelsSet),     // ['online'] | ['in_store'] | both
    providers: Array.from(providersSet),
    countries: Array.from(countriesSet),
    _coherent: coherent,                   // UI must not render when false
  };
}

export const _internal = { readAnalysis, CONFIDENCE_RANK };
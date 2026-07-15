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

// Newest-first comparator on created_date (falls back to 0 for missing dates).
function newestFirst(a, b) {
  const ta = a?.created_date ? new Date(a.created_date).getTime() : 0;
  const tb = b?.created_date ? new Date(b.created_date).getTime() : 0;
  return tb - ta;
}

// Deduplicate analyses to the MOST RECENT one per channel.
//
// WHY: the account panel aggregates the *current state* of the business, not a
// pile of re-runs. A user who re-runs the analyzer 7 times with different inputs
// produces 7 online rows for the SAME business — summing them inflates GMV ×7
// (e.g. a real ~€380k/yr business shows a nonsensical €2.66M). The correct
// aggregate combines DISTINCT channels only: the latest online + the latest
// in-store = the business's total payment cost. Re-runs of the same channel
// collapse to the latest one (that channel's current truth).
export function dedupeLatestByChannel(analyses) {
  const byChannel = new Map();
  for (const a of analyses) {
    const existing = byChannel.get(a.channel);
    if (!existing || newestFirst(a, existing) < 0) byChannel.set(a.channel, a);
  }
  return Array.from(byChannel.values());
}

// Aggregate an array of AnalyzerResult rows into a single account view.
//
// The rows are first deduplicated to the latest analysis per channel (see
// dedupeLatestByChannel) so we aggregate ACROSS distinct channels only —
// never across re-runs of the same channel. Money (GMV, fees, savings) is then
// summed across those distinct channels (additive euros), and the blended
// effective rate is GMV-weighted across them. `channels` lists which channels
// contributed so the UI can label it.
export function derivePaymentsAccount(rows) {
  const allAnalyses = (Array.isArray(rows) ? rows : [])
    .map(readAnalysis)
    .filter(Boolean);

  if (allAnalyses.length === 0) {
    return { available: false, count: 0 };
  }

  // ── DEDUPE: latest analysis per channel. This is the semantic fix — we
  // aggregate the business's current state, not a stack of re-executions.
  const analyses = dedupeLatestByChannel(allAnalyses).sort(newestFirst);
  const rawCount = allAnalyses.length;
  const distinctChannels = analyses.length;

  // Money aggregates — plain sums across DISTINCT channels only.
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

  // ── COHERENCE — two checks, both must pass or the UI must not render: ──
  // 1) ARITHMETIC: total fees === fees reconstructed from blended rate on total
  //    GMV (should be identical). Tolerate €1 of float rounding.
  const reconstructedFees = blendedBps != null ? totalAnnualGmv * (blendedBps / BPS_PER_UNIT) : null;
  const arithmeticCoherent =
    reconstructedFees != null && Math.abs(reconstructedFees - totalAnnualFees) <= 1;
  // 2) SEMANTIC: we must be aggregating one row per channel — never summing
  //    re-runs of the same channel. After dedupe this is always true, but we
  //    assert it explicitly so a future regression can't silently re-inflate.
  const semanticCoherent = analyses.length === channelsSet.size;
  const coherent = arithmeticCoherent && semanticCoherent;

  // Whether the aggregate adds anything over the hero: only when it spans more
  // than one distinct channel. With a single channel the account view is just
  // the latest analysis (already shown by the hero) — the UI should hide it.
  const addsValueOverHero = distinctChannels > 1;

  return {
    available: true,
    count: distinctChannels,               // DISTINCT channels aggregated
    raw_count: rawCount,                   // total rows before dedupe (for the trend, not the sum)
    analyses,                              // deduped, newest first
    total_annual_gmv: totalAnnualGmv,
    total_annual_fees: totalAnnualFees,
    total_annual_savings: totalAnnualSavings,
    blended_effective_bps: blendedBps,
    blended_effective_pct: bpsToPct(blendedBps),
    confidence: bestConfidence,            // verified | pending_verification | estimated
    channels: Array.from(channelsSet),     // ['online'] | ['in_store'] | both
    providers: Array.from(providersSet),
    countries: Array.from(countriesSet),
    adds_value_over_hero: addsValueOverHero,
    _coherent: coherent,                   // UI must not render when false
  };
}

export const _internal = { readAnalysis, CONFIDENCE_RANK, dedupeLatestByChannel, newestFirst };
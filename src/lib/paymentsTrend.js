// paymentsTrend — pure derivation of the EVOLUTION over time of a brand's
// payments analyses (Phase 2 · dashboard: history trend / evolución).
//
// This is the OPPOSITE end of paymentsAccount.js:
//   • paymentsAccount DEDUPES re-runs (aggregates the business's current state).
//   • paymentsTrend KEEPS every re-run — that is precisely the point. Each
//     re-execution is a point in time; plotting them shows how the effective
//     rate and identified savings moved as inputs / verification improved.
//
// SAME GUARDAS as the rest of Phase 2:
//   • Payments only. No fabrication. ONE source: every number derives from the
//     persisted engine_result / input_snapshot on each AnalyzerResult.
//   • Coherence: each point must satisfy fees === gmv × (bps/10000) (the same
//     arithmetic the account uses). A `_coherent` flag is returned so the UI
//     can refuse to render an incoherent series (honest over pretty).
//   • available: false when there are fewer than 2 usable points — a single
//     analysis has no evolution to show, so the panel hides.
//
// Pure function of plain inputs. No SDK, no side effects.

const BPS_PER_UNIT = 10000;
const num = (v) => (isFinite(Number(v)) ? Number(v) : null);

// Pull the fields one point needs from an AnalyzerResult, defensively.
// Returns null for legacy scoreEngine rows that lack the payments shape.
function readPoint(row) {
  const er = row?.details?.engine_result || null;
  const snap = row?.details?.input_snapshot || {};
  if (!er) return null;

  const currentBps = num(er.current_effective_bps);
  const monthlyGmv = num(snap.monthly_gmv_eur);
  const created = row?.created_date ? new Date(row.created_date) : null;
  if (currentBps == null || monthlyGmv == null || !created || isNaN(created.getTime())) return null;

  const annualGmv = monthlyGmv * 12;
  const annualFees = annualGmv * (currentBps / BPS_PER_UNIT);
  const annualSavings = Math.max(0, num(er?.annual_savings_eur?.point) ?? num(row?.total_savings) ?? 0);

  return {
    id: row.id,
    ts: created.getTime(),
    created_date: row.created_date,
    channel: er?.cohort?.channel === "in_store" ? "in_store" : "online",
    verified: (row.verification_status || "estimated") === "verified",
    effective_bps: currentBps,
    effective_pct: currentBps / 100,
    annual_gmv: annualGmv,
    annual_fees: annualFees,
    annual_savings: annualSavings,
  };
}

// Build the chronological evolution series from all of a brand's analyses.
//
// Points are sorted OLDEST → NEWEST (natural reading direction for a timeline).
// Every re-run is kept — the series is the whole story of how the numbers moved.
export function derivePaymentsTrend(rows) {
  const points = (Array.isArray(rows) ? rows : [])
    .map(readPoint)
    .filter(Boolean)
    .sort((a, b) => a.ts - b.ts);

  // Need at least 2 points for an evolution to exist.
  if (points.length < 2) {
    return { available: false, count: points.length };
  }

  // COHERENCE — every point must satisfy fees === gmv × (bps/10000).
  // Tolerate €1 of float rounding per point (same tolerance as the account).
  const coherent = points.every((p) => {
    const reconstructed = p.annual_gmv * (p.effective_bps / BPS_PER_UNIT);
    return Math.abs(reconstructed - p.annual_fees) <= 1;
  });

  const first = points[0];
  const last = points[points.length - 1];

  return {
    available: true,
    count: points.length,
    points,                                        // oldest → newest
    // Deltas from the first to the latest analysis (for the caption).
    rate_delta_pct: last.effective_pct - first.effective_pct,   // negative = improved
    savings_delta_eur: last.annual_savings - first.annual_savings,
    latest_rate_pct: last.effective_pct,
    latest_savings_eur: last.annual_savings,
    _coherent: coherent,                           // UI must not render when false
  };
}

export const _internal = { readPoint };
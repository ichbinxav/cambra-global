/**
 * verificationStatus.js — Chunk 6 helper.
 *
 * PURE, READ-ONLY. Given an AnalyzerResult (+ optional AnalyzerInput), returns
 * a per-vertical verification snapshot that the Results page uses to render
 * confidence badges/labels.
 *
 * ══ Design ═══════════════════════════════════════════════════════════════════
 *
 *   • Zero business logic. No re-computation of savings/scores. Just reads
 *     what Chunk 1 (schema) + 4 (producer) + 5A (materializer) already wrote:
 *
 *       AnalyzerResult.verification_status  →  "verified" | "estimated" | "pending_verification"
 *       AnalyzerResult.verification_scope   →  ["payments"] | [] | ["payments","shipping"] | …
 *       AnalyzerResult.assumptions          →  the array where 5A appends
 *                                              "data_confidence: <label> (…)"
 *       AnalyzerInput.data_source           →  "manual" | "file_upload" | "api" | "hybrid"
 *
 *   • data_confidence is NOT a first-class column on AnalyzerResult (5A kept
 *     it in assumptions, aditivo). So we regex it back out here. If the
 *     assumption line isn't present (older rows), we default confidence to
 *     "high" only when verification_status === "verified" AND the vertical is
 *     in verification_scope; otherwise "estimated".
 *
 *   • Verticals: currently 3 (payments / shipping / saas) because that's what
 *     the Results page renders. Adding banking/telecom/etc. is a one-line
 *     change here — no consumer refactor needed.
 *
 * ══ Return shape ═════════════════════════════════════════════════════════════
 *
 *   {
 *     overall: "verified" | "mixed" | "estimated",
 *     data_confidence: "high" | "provisional" | "insufficient" | null,
 *     active_days: number | null,
 *     charge_count: number | null,
 *     verticals: {
 *       payments: { status: "verified" | "estimated", confidence: "high" | "provisional" | null, source: "stripe" | null },
 *       shipping: { status: "verified" | "estimated", confidence: null, source: null },
 *       saas:     { status: "verified" | "estimated", confidence: null, source: null },
 *     },
 *     source_integration_id: string | null,
 *   }
 *
 * ══ Frenos ═══════════════════════════════════════════════════════════════════
 *
 *   • Does NOT touch scoreEngine.
 *   • Does NOT read from the database — callers pass the rows in.
 *   • Missing fields default to safe "estimated". Never throws.
 */

const VERTICALS = ["payments", "shipping", "saas"];

/**
 * Extract "data_confidence: <label> (<N> active day(s), <M> charges)." from
 * the assumptions array 5A wrote. Returns { confidence, activeDays, chargeCount }.
 * Null pieces when the line isn't there.
 */
function extractConfidenceFromAssumptions(assumptions) {
  if (!Array.isArray(assumptions)) return { confidence: null, activeDays: null, chargeCount: null };
  for (const line of assumptions) {
    if (typeof line !== "string") continue;
    const m = line.match(/data_confidence:\s*(high|provisional|insufficient)\s*\((\d+)\s+active\s+day\(s\),\s*(\d+)\s+charges?\)/i);
    if (m) {
      return {
        confidence: m[1].toLowerCase(),
        activeDays: Number(m[2]) || 0,
        chargeCount: Number(m[3]) || 0,
      };
    }
    // Softer match — just the label — in case the count parenthetical is missing.
    const soft = line.match(/data_confidence:\s*(high|provisional|insufficient)/i);
    if (soft) {
      return { confidence: soft[1].toLowerCase(), activeDays: null, chargeCount: null };
    }
  }
  return { confidence: null, activeDays: null, chargeCount: null };
}

/**
 * Determine which provider/source a verified vertical came from. Right now
 * only Stripe→payments exists (Chunk 4). Shipping/SaaS bridges don't exist
 * yet, so their `source` stays null even in the verified-scope case (which
 * won't happen until we build those bridges).
 */
function sourceForVertical(vertical, sourceIntegrationId) {
  if (vertical === "payments" && sourceIntegrationId) return "stripe";
  return null;
}

export function getVerificationStatus(analyzerResult, analyzerInput) {
  const result = analyzerResult || {};
  const scope = Array.isArray(result.verification_scope) ? result.verification_scope : [];
  const status = result.verification_status || "estimated";
  const isVerifiedRow = status === "verified";

  const { confidence, activeDays, chargeCount } = extractConfidenceFromAssumptions(result.assumptions);

  const verticals = {};
  for (const v of VERTICALS) {
    const inScope = scope.includes(v);
    const verticalStatus = (isVerifiedRow && inScope) ? "verified" : "estimated";
    verticals[v] = {
      status: verticalStatus,
      // Only payments carries a confidence today (Stripe bridge). Other
      // verticals return null — the UI shows "estimated" without a
      // sub-label.
      confidence: (verticalStatus === "verified" && v === "payments") ? (confidence || "high") : null,
      source: sourceForVertical(v, result.source_integration_id),
    };
  }

  const verifiedCount = VERTICALS.filter(v => verticals[v].status === "verified").length;
  let overall;
  if (verifiedCount === 0) overall = "estimated";
  else if (verifiedCount === VERTICALS.length) overall = "verified";
  else overall = "mixed";

  return {
    overall,
    data_confidence: confidence,       // null when this row is estimated
    active_days: activeDays,
    charge_count: chargeCount,
    verticals,
    source_integration_id: result.source_integration_id || null,
    // Convenience: which verticals are verified/estimated as arrays, so the
    // hero label doesn't have to re-derive it.
    verified_verticals: VERTICALS.filter(v => verticals[v].status === "verified"),
    estimated_verticals: VERTICALS.filter(v => verticals[v].status === "estimated"),
    // Pass-through so consumers can show "based on Stripe data" without
    // re-reading the input.
    data_source: analyzerInput?.data_source || null,
  };
}

// Exported for tests only.
export const __test = { extractConfidenceFromAssumptions, VERTICALS };
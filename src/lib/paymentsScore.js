// ─────────────────────────────────────────────────────────────────────────────
// paymentsScore — pure presentation helper for the CAMBRA payments efficiency
// Score (the "credit-score" style grade in the report hero).
//
// SINGLE SOURCE OF TRUTH RULE (hard rule from the operator):
//   The Score is a PURE FUNCTION of the two numbers the engine already
//   produces — current_effective_bps and achievable_effective_bps. It does
//   NOT recompute anything, does NOT touch the rate table, does NOT add a
//   second engine, and does NOT call the backend. Same engine_result in →
//   same score out. This file has ZERO imports.
//
// WHY THIS LIVES OUTSIDE paymentsGap.js:
//   The Score is a PRESENTATION-LAYER derivation (how we grade the merchant's
//   cost efficiency for the UI), not part of the savings arithmetic. Keeping
//   it separate means paymentsGap.js — which is byte-locked against three
//   verbatim copies + a sync test — never has to change to tune the Score.
//
// CALIBRATION (validated 2026-07-14 against the real seeded PaymentsRateTable):
//   Profile €30k/mo · ticket €50 · FR/EU · online. Two-anchor model with an
//   ABSOLUTE market ceiling produced a credible, discriminating distribution:
//     Stancer 1.00% → 100 A      (already at the floor — top-tier)
//     Adyen   1.22% →  93 A
//     Stripe  2.00% →  63 C      (mainstream — honest but motivating, NOT F)
//     Payplug 2.00% →  63 C
//     Mollie  2.30% →  46 D      (a little pricey — "room to improve")
//     Shopify 2.50% →  38 F
//     SumUp   2.50% →  34 F      (genuinely expensive)
//     PayPal  3.60% →   0 F
//   Earlier single-anchor (vs-floor-only) and relative-ceiling models sent
//   Stripe/Payplug to D and Mollie to F — NOT credible, rejected. The
//   absolute ceiling of 3.10% is the sealed calibration. This distribution is
//   frozen as the test oracle in paymentsScore.test.js — any regression that
//   moves Stripe out of C (or a mainstream PSP into F) fails the suite.
//
// FRAMING (legal + UX, sealed with the operator):
//   The Score grades the MERCHANT'S cost efficiency — NOT the named PSP. The
//   context line ALWAYS talks about "your effective rate / your setup" and
//   NEVER names or judges the PSP ("your PSP is F" = third-party disparagement
//   risk + unfair UX). Consumers must render `contextLine` verbatim and must
//   NOT append a provider name to the verdict.
//
// CONFIDENCE INHERITANCE:
//   The Score inherits the confidence state of the figure it's derived from.
//   `verified === false` (estimated) → the badge shows an "Estimate" state and
//   renders muted / with a "~". The number is honest about being an estimate
//   until the merchant connects their PSP. This helper surfaces `verified`
//   straight through so the component can style accordingly — it does not
//   change the score itself (an estimate and a verified reading of the same
//   two bps produce the same score; only the presentation differs).
// ─────────────────────────────────────────────────────────────────────────────

// ─── Calibration constants (PRESENTATION-LAYER, not engine constants) ────────

// Market "expensive" ceiling in basis points. The point where the Score hits 0
// (grade F). Anchored to an ABSOLUTE market rate, NOT a multiple of the floor —
// because the mainstream EU rack rate (~2.0–2.3%) is an absolute market fact,
// independent of the negotiated floor. Validated 2026-07-14 (see header table).
//
// REVISIT WHEN PEER-PERCENTILE (step 2) SHIPS: this is a calibration constant
// tuned for the vs-floor mode. When cohort data exists, the "vs_percentile"
// mode replaces the ceiling anchor with the cohort distribution — this constant
// stops being the reference for that mode. The `mode` parameter already plumbs
// this switch so the component never needs rewriting.
//
// REGION NOTE: today this is an EU-tuned single value. When UK/US/RoW cohorts
// are analyzed, pass a region-specific ceiling via opts.ceilingBps rather than
// editing this default — the function already accepts the override.
const DEFAULT_CEILING_BPS = 310;

// Grade thresholds on the 0–100 scale. A≥85 · B 70–84 · C 55–69 · D 40–54 · F<40.
const GRADE_THRESHOLDS = [
  { min: 85, grade: "A" },
  { min: 70, grade: "B" },
  { min: 55, grade: "C" },
  { min: 40, grade: "D" },
  { min: 0,  grade: "F" },
];

function gradeFromScore(score) {
  for (const t of GRADE_THRESHOLDS) {
    if (score >= t.min) return t.grade;
  }
  return "F";
}

// Grade → semantic color TOKEN NAME (maps to the existing --score-* CSS tokens
// in src/index.css; the component turns these into the concrete classes). We
// return token names, not hex, so the design system stays the single source of
// truth for the actual colors.
//   A → excellent (cyan-teal) · B → good (blue) · C/D → medium (amber) · F → risk (red)
function toneFromGrade(grade) {
  switch (grade) {
    case "A": return "excellent";
    case "B": return "good";
    case "C":
    case "D": return "medium";
    default:  return "risk";
  }
}

// Checkpoint H (2026-08-06) — i18n key for the verdict. The English strings
// below stay for backwards compatibility (existing callers + tests read
// `contextLine` verbatim), but components should render t(contextKey) so the
// verdict follows the ACTIVE app language instead of being English-only.
// Grades the merchant's COST EFFICIENCY, never the PSP — same rule as the copy.
function contextKeyFromGrade(grade) {
  return `score_ctx_${["A", "B", "C", "D"].includes(grade) ? grade : "F"}`;
}

// Context line — grades the merchant's COST EFFICIENCY, never the PSP. Rendered
// verbatim by the component. NEVER append a provider name to these.
function contextLineFromGrade(grade) {
  switch (grade) {
    case "A":
      return "Your effective rate is at the achievable floor — top-tier payment costs.";
    case "B":
      return "Your effective rate is close to the achievable floor — you're doing well.";
    case "C":
      return "Your effective rate sits mid-market. There's room to bring it down.";
    case "D":
      return "Your effective rate is above what's achievable — worth acting on.";
    default:
      return "Your effective rate is well above what's achievable — significant room to recover.";
  }
}

// ─── Public entry point ──────────────────────────────────────────────────────

// computePaymentsScore — derive the efficiency Score from an engine_result.
//
// Contract:
//   engineResult: the FULL engine_result object (as produced by calculateGap /
//     persisted on the session). Reads ONLY current_effective_bps and
//     achievable_effective_bps + cohort.verified. Never mutates it.
//   opts (optional):
//     mode: "vs_floor" (default) | "vs_percentile"
//       vs_floor      → today's model: distance from the achievable floor
//                       toward the market ceiling.
//       vs_percentile → RESERVED for step 2 (peer benchmark). Not implemented
//                       yet; passing it today falls back to vs_floor and flags
//                       mode:"vs_floor" in the return so the caller knows the
//                       percentile path didn't run. This is the seam that lets
//                       the component stay unchanged when step 2 ships.
//     ceilingBps: override the market ceiling (e.g. a region-specific value).
//
// Returns:
//   { available: false, reason }                       // can't score honestly
//   { available: true, score, grade, tone, contextLine,
//     verified, mode }                                  // ready to render
//
// available:false cases (NEVER invent a grade without a defensible basis):
//   - current or achievable missing / non-finite.
//   - achievable <= 0 (division-by-zero guard; a zero floor is meaningless).
//   The component renders a neutral "Connect to score" state for these, never
//   a fabricated letter.
export function computePaymentsScore(engineResult, opts = {}) {
  const current = Number(engineResult?.current_effective_bps);
  const achievable = Number(engineResult?.achievable_effective_bps);
  const verified = engineResult?.cohort?.verified === true;

  if (!isFinite(current) || !isFinite(achievable) || achievable <= 0) {
    return { available: false, reason: "insufficient_bps" };
  }

  const ceilingBps = isFinite(Number(opts.ceilingBps)) && Number(opts.ceilingBps) > achievable
    ? Number(opts.ceilingBps)
    : DEFAULT_CEILING_BPS;

  // vs_percentile is reserved for step 2 — fall back to vs_floor today and
  // report the mode that actually ran (so the caller never mislabels it).
  const effectiveMode = "vs_floor";

  // Two-anchor position: 0 = at the floor (A), 1 = at/above the market ceiling
  // (F). Clamped both ends. If ceiling <= achievable (shouldn't happen given
  // the guard above) position is 0 → score 100.
  const denom = ceilingBps - achievable;
  const positionRaw = denom > 0 ? (current - achievable) / denom : 0;
  const position = Math.max(0, Math.min(1, positionRaw));

  const score = Math.round(Math.max(0, Math.min(100, 100 - position * 100)));
  const grade = gradeFromScore(score);

  return {
    available: true,
    score,
    grade,
    tone: toneFromGrade(grade),
    contextLine: contextLineFromGrade(grade),
    contextKey: contextKeyFromGrade(grade),
    verified,
    mode: effectiveMode,
  };
}

// Exported for tests + future reuse. Not part of the primary API surface.
export {
  DEFAULT_CEILING_BPS,
  gradeFromScore,
  toneFromGrade,
  contextLineFromGrade,
  contextKeyFromGrade,
};
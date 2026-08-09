// paymentsNextAction — pure decision tree for the Action Center ("your next
// best step"). Reads the SAME aggregated state the dashboard Hero reads
// (derivePaymentsAccount output + the latest engine_result) and returns ONE
// primary action, plus small secondaries.
//
// HARD RULES (sealed with the operator):
//   • ONE source. Every € here is a SLICE of the same figures the account /
//     engine_result already produced — never a new number, never a re-compute,
//     never double-counting. `recoverable_eur` is the account's aggregated
//     point estimate (or the single analysis's point) verbatim.
//   • ONE primary action. The tree returns exactly one `intent` — the caller
//     renders one CTA. Secondaries are tiny links, never competing buttons.
//   • HONEST states. We never claim "drift detected" without history, never
//     say "verified" unless the confidence says so. The "already optimized"
//     branch is a positive dead-end (top-tier badge), not a nag.
//   • Reuses EXISTING flows only — the returned `intent` maps to CTAs that
//     already exist (OAuth connect, CollectiveModal, BookCallModal, Analyzer).
//     This file decides WHICH; it opens nothing itself.
//
// Pure function of plain inputs. No SDK, no side effects, ZERO imports.

// Same thresholds as PaymentsResults / Dashboard (kept in sync manually — all
// three are presentation-layer routing, not engine constants).
const CALL_GMV_MONTHLY_EUR = 250000;    // ≥ €250k/mo GMV → human call
const CALL_ANNUAL_SAVINGS_EUR = 25000;  // ≥ €25k/yr recoverable → human call

// Recoverable below this is "noise" — treated as already-optimized for routing
// (mirrors the engine's already_optimized noise floor spirit; presentation only).
const RECOVERABLE_FLOOR_EUR = 200;

const num = (v) => (isFinite(Number(v)) ? Number(v) : null);

// Intents the caller knows how to route (all map to EXISTING flows):
//   verify_connect  → OAuth Stripe connect (PSP unsupported → waitlist)
//   book_call       → BookCallModal
//   join_collective → CollectiveModal
//   monitor_drift   → positive dead-end, no modal (badge + free monitoring)
//   add_channel     → new analysis (/Analyzer)
export const NEXT_ACTION_INTENT = {
  VERIFY_CONNECT: "verify_connect",
  BOOK_CALL: "book_call",
  JOIN_COLLECTIVE: "join_collective",
  MONITOR_DRIFT: "monitor_drift",
  ADD_CHANNEL: "add_channel",
};

/**
 * @typedef {{ available: false } | {
 *   available: true,
 *   intent: string,
 *   tone: "opportunity" | "positive",
 *   effort: string,
 *   impact: string,
 *   recoverable_eur: number,
 *   channels: string[],
 *   missingChannel: string | null,
 *   suggestAdd?: string | null,
 * }} PaymentsNextAction
 */

// computePaymentsNextAction — decide the single next best step.
//
// Inputs:
//   account   : derivePaymentsAccount() output (may be {available:false}).
//   latest    : the latest AnalyzerResult row (for engine_result + confidence
//               + channel), used when the account view isn't multi-channel.
//   opts      : { inCollective?: bool }  — whether the brand already joined the
//               collective (caller resolves this; we don't touch the SDK).
//
// Returns:
//   { available: false }  — nothing to recommend (no analysis yet)
//   { available: true, intent, tone, recoverable_eur, effort, impact,
//     channels, missingChannel? }
//     tone: "opportunity" | "positive"  (drives styling — green victory vs cyan action)
/** @returns {PaymentsNextAction} */
export function computePaymentsNextAction(account, latest, opts = {}) {
  const inCollective = opts.inCollective === true;

  const er = latest?.details?.engine_result || null;
  const confidence =
    (account?.available && account.confidence) ||
    latest?.verification_status ||
    "estimated";
  const isVerified = confidence === "verified";

  // Recoverable = aggregated account point when multi-channel, else the single
  // analysis point. NEVER summed across re-runs (account already dedupes).
  const recoverable =
    (account?.available && account._coherent ? num(account.total_annual_savings) : null) ??
    num(er?.annual_savings_eur?.point) ??
    num(latest?.total_savings) ??
    0;

  // Channels present + whether a channel is genuinely missing.
  const channels = account?.available ? (account.channels || []) : (er?.cohort?.channel === "in_store" ? ["in_store"] : er ? ["online"] : []);
  const hasOnline = channels.includes("online");
  const hasInStore = channels.includes("in_store");
  // "Add a channel" is only a HONEST suggestion when we can see the brand's
  // account-level picture (real aggregate) and exactly one channel is present.
  // From a single loose engine_result we can't tell "operates one channel" from
  // "hasn't analyzed the other yet" — so we DON'T surface it there. This keeps
  // "recover what you have" ahead of a speculative "add the other channel".
  const accountSingleChannel = account?.available && (account.channels || []).length === 1;
  const missingChannel = accountSingleChannel
    ? (hasOnline && !hasInStore ? "in_store" : (!hasOnline && hasInStore ? "online" : null))
    : null;

  const gmvMonthly =
    (account?.available ? num(account.total_annual_gmv) / 12 : null) ??
    num(latest?.details?.input_snapshot?.monthly_gmv_eur) ??
    null;

  // Nothing to work with.
  if (!er && !(account?.available)) return { available: false };

  const highValue =
    (isFinite(gmvMonthly) && gmvMonthly >= CALL_GMV_MONTHLY_EUR) ||
    (isFinite(recoverable) && recoverable >= CALL_ANNUAL_SAVINGS_EUR);

  const base = { available: true, recoverable_eur: Math.max(0, recoverable), channels, missingChannel };

  // ── 4 — ALREADY OPTIMIZED (positive dead-end). Recoverable below the noise
  //        floor → nothing meaningful to recover. Top-tier, monitor drift. ──
  if (recoverable < RECOVERABLE_FLOOR_EUR) {
    return { ...base, intent: NEXT_ACTION_INTENT.MONITOR_DRIFT, tone: "positive", effort: "low", impact: "protect" };
  }

  // ── 1 — NOT VERIFIED (estimate) with a recoverable gap → verify first. ──
  //        Converts the estimate into a verified number before recovery.
  if (!isVerified) {
    return { ...base, intent: NEXT_ACTION_INTENT.VERIFY_CONNECT, tone: "opportunity", effort: "low", impact: "verify" };
  }

  // From here: VERIFIED + recoverable ≥ floor.

  // ── 3 — ALREADY IN THE COLLECTIVE → book the recovery call. ──
  if (inCollective) {
    return { ...base, intent: NEXT_ACTION_INTENT.BOOK_CALL, tone: "opportunity", effort: "low", impact: "recover" };
  }

  // ── 2 — VERIFIED, recoverable, outside the collective → segment by size. ──
  //        Recovering the margin on the channel you ALREADY have is always the
  //        primary action. "Add your other channel" is NEVER a primary CTA
  //        (we can't reliably tell "operates one channel" from "hasn't analyzed
  //        the other yet") — it rides along as a SECONDARY link (`suggestAdd`)
  //        only when the real account aggregate shows exactly one channel.
  const suggestAdd = missingChannel || null;
  if (highValue) {
    return { ...base, intent: NEXT_ACTION_INTENT.BOOK_CALL, tone: "opportunity", effort: "low", impact: "recover", suggestAdd };
  }
  return { ...base, intent: NEXT_ACTION_INTENT.JOIN_COLLECTIVE, tone: "opportunity", effort: "low", impact: "recover", suggestAdd };
}

export { CALL_GMV_MONTHLY_EUR, CALL_ANNUAL_SAVINGS_EUR, RECOVERABLE_FLOOR_EUR };
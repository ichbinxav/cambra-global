// ─────────────────────────────────────────────────────────────────────────────
// paymentsRoadmap — pure derivation of the CAMBRA recovery roadmap from data
// that ALREADY exists (engine_result + PaymentsRateTable). ZERO invented
// numbers, ZERO new engine. This is a PRESENTATION-LAYER derivation, like
// paymentsScore.js — it does not touch paymentsGap.js or the backend.
//
// ════════════════════════════════════════════════════════════════════════════
// BUSINESS PRINCIPLE (governs EVERYTHING here — read before editing):
//   CAMBRA does NOT make money by telling a merchant "go to this cheaper PSP".
//   If we hand them a concrete destination, they leave on their own (bypass)
//   and we lose them. CAMBRA's value is the SERVICE: managed migration/
//   renegotiation + the COLLECTIVE (many brands negotiating as one) + the
//   RESULTS-based model (we only charge if the merchant actually saves).
//
//   Therefore, HARD RULES enforced by this module:
//     1. The PaymentsRateTable comparison is used ONLY INTERNALLY to size the
//        opportunity (how much €/year is on the table). We NEVER surface a
//        concrete PSP as a destination.  ⟶ recommendations carry NO provider
//        name for the target. `target_provider` is deliberately NOT part of
//        the output shape.
//     2. The target rate is presented NEUTRALLY: "CAMBRA takes you to ~X%".
//        NEVER labelled "public" (invites bypass) nor "exclusive" (misleading
//        advertising — we have no proprietary agreements yet).
//     3. Proof that the opportunity is real is given via the AGGREGATE market
//        range ("brands in your tier reach ~X%"), never by naming a provider.
//     4. Every action/CTA leads to CAMBRA's offer (collective / managed
//        migration / call), never to a third party. CTAs are decided by the
//        component, but this module tags each rec with a `cta_intent` the
//        component maps to CAMBRA-only actions.
//
// HONESTY GUARDS (non-negotiable):
//     • No "exclusive"/"public" claim about the target rate.
//     • Don't promise a concrete rate CAMBRA can't deliver today — framing is
//       "founding member · we build the negotiating power · results-based".
//     • Don't reveal the rate's provenance or name the destination PSP.
//     • Every number traces to engine_result or PaymentsRateTable.
// ════════════════════════════════════════════════════════════════════════════

// ─── Constants (presentation-layer, not engine constants) ────────────────────

// Materiality floor for showing the "recover your processor margin" rec. Below
// this annual €, the gap is noise and we don't push an action. Mirrors the
// engine's own ALREADY_OPTIMIZED absolute floor (€200/yr) so the roadmap and
// the classifier never disagree about "is there something here".
const MATERIAL_ANNUAL_EUR = 200;

// Effort levels — ordinal, used only for tie-break ordering (lower = easier).
const EFFORT = { low: 1, medium: 2, high: 3 };

function eurFromBpsGap(gapBps, monthlyGmvEur) {
  if (!isFinite(gapBps) || gapBps <= 0 || !isFinite(monthlyGmvEur) || monthlyGmvEur <= 0) return 0;
  return (gapBps / 10000) * monthlyGmvEur * 12;
}

// Internal-only: compute an effective bps for a candidate rate row at the
// merchant's REAL ticket. Mirrors the engine's amortization
// (percent + fixed/ticket*10000). NOT exported to any UI — used solely to size
// the "better rate" opportunity. No provider name ever leaves this function.
function effectiveBpsAtTicket(percentBps, fixedMinor, avgTicketEur) {
  if (!isFinite(percentBps) || !isFinite(avgTicketEur) || avgTicketEur <= 0) return Infinity;
  const fixedMajor = (isFinite(fixedMinor) ? fixedMinor : 0) / 100;
  return percentBps + (fixedMajor / avgTicketEur) * 10000;
}

// Find the BEST achievable effective rate in the merchant's region+channel from
// the rate table, evaluated at their real ticket. Returns { effectiveBps,
// verified } or null. INTERNAL SIZING ONLY — the winning provider slug is
// deliberately discarded so it can never leak to the UI.
//
// Honesty: we track whether the winning evidence came from a verified:true row
// so the caller can downgrade confidence + add the "estimated" caveat when the
// best evidence is a fallback row.
function findBestMarketRate(rateTable, region, channel, avgTicketEur, currentProviderSlug) {
  if (!Array.isArray(rateTable) || !isFinite(avgTicketEur) || avgTicketEur <= 0) return null;
  let best = null;
  for (const r of rateTable) {
    if (!r || r.active === false) continue;
    if ((r.channel || "online") !== channel) continue;
    if (r.region !== region) continue;
    if (r.provider_slug === "ANY") continue;                 // regional fallback, not a real destination
    if (r.provider_slug === currentProviderSlug) continue;   // never "move to yourself"
    const eff = effectiveBpsAtTicket(r.percent_bps, r.fixed_fee_minor_units, avgTicketEur);
    if (!isFinite(eff)) continue;
    if (!best || eff < best.effectiveBps) {
      best = { effectiveBps: eff, verified: r.verified === true };
    }
  }
  return best;
}

// Aggregate market proof: the range of effective rates achievable in the
// merchant's cohort (region+channel), evaluated at their ticket — the low end
// (best) and a representative "well-negotiated" mid. Returns { lowBps, midBps }
// or null. AGGREGATE ONLY — no provider names. Used to render "brands in your
// tier reach ~X%".
function marketRange(rateTable, region, channel, avgTicketEur, currentProviderSlug) {
  if (!Array.isArray(rateTable) || !isFinite(avgTicketEur) || avgTicketEur <= 0) return null;
  const effs = [];
  for (const r of rateTable) {
    if (!r || r.active === false) continue;
    if ((r.channel || "online") !== channel) continue;
    if (r.region !== region) continue;
    if (r.provider_slug === "ANY") continue;
    if (r.provider_slug === currentProviderSlug) continue;
    const eff = effectiveBpsAtTicket(r.percent_bps, r.fixed_fee_minor_units, avgTicketEur);
    if (isFinite(eff)) effs.push(eff);
  }
  if (effs.length === 0) return null;
  effs.sort((a, b) => a - b);
  return { lowBps: effs[0], midBps: effs[Math.floor(effs.length / 2)] };
}

// ─── Public entry point ──────────────────────────────────────────────────────

// buildRecoveryRoadmap — derive the recovery roadmap from the engine's OWN
// numbers. Single-source-of-truth, anti-double-counting design (sealed with
// the operator 2026-07-14):
//
//   • SINGLE TARGET  — the target rate is the engine's achievable_effective_bps
//     (the EXACT same number the hero uses). The roadmap never computes a
//     second, lower target from the rate table. `findBestMarketRate` is NOT
//     used to size any €.
//
//   • SINGLE POOL    — there is ONE recoverable figure: annual_savings_eur.point
//     (the hero number). It is surfaced ONCE, at the top (`recoverable_annual`).
//
//   • ROUTES, NOT €  — recommendations are the HOW (renegotiate margin /
//     better rate via CAMBRA / connect to verify). Each carries effort ·
//     confidence · priority, but NO per-rec € (they're alternative/complementary
//     paths to the SAME pool — a per-rec € would repeat or contradict the pool).
//
//   • UPSIDE AS AMBITION — marketRange is kept ONLY as neutral aggregate proof
//     of headroom ("brands in your tier reach ~X%"), rendered as ambition COPY
//     via `ambition_bps`. It never produces a hard € that competes with the hero.
//
// INVARIANT (enforced by the coherence test): no rec carries a € that exceeds
// the pool; the UI never sums recs. The output shape makes summation impossible
// (recs have no € field).
//
// Contract:
//   engineResult: full engine_result (reads current/achievable bps, cohort,
//     classification, annual_savings_eur, mode). Never mutated.
//   inputSnapshot: { monthly_gmv_eur, avg_ticket_eur, provider_slug, country }.
//   rateTable: PaymentsRateTable rows (INTERNAL, ambition-only). Optional — when
//     absent, the ambition line is simply omitted (never invented).
//
// Returns:
//   { state: 'already_optimized', recoverable_annual: null, recommendations: [] }
//   { state: 'insufficient_data', recoverable_annual: null, recommendations: [] }
//   { state: 'savings_opportunity',
//     recoverable_annual: { lo, point, hi },   // the ONE figure, = hero pool
//     target_bps,                              // = achievable_effective_bps (single target)
//     ambition_bps?,                           // neutral upside ("reach ~X%"), NO €
//     recommendations: [ Route... ] }
//
// Route shape (NO € field — that's the whole point):
//   {
//     id, title,                       // CAMBRA-framed, no PSP name
//     confidence: 'high'|'medium'|'low',
//     effort: 'low'|'medium'|'high',
//     priority: 'high'|'medium'|'low',
//     caveat?,                         // for the low-confidence better-rate route
//     cta_intent: 'managed_migration'|'collective'|'call'|'connect_verify',
//   }
export function buildRecoveryRoadmap(engineResult, inputSnapshot = {}, rateTable = null) {
  const classification = engineResult?.classification;
  const mode = engineResult?.mode;
  const current = Number(engineResult?.current_effective_bps);
  const achievable = Number(engineResult?.achievable_effective_bps);
  const cohortVerified = engineResult?.cohort?.verified === true;
  const region = engineResult?.cohort?.key?.split("|")?.[2] || null;
  const channel = engineResult?.cohort?.channel === "in_store" ? "in_store" : "online";
  const ticket = Number(inputSnapshot?.avg_ticket_eur);
  const providerSlug = inputSnapshot?.provider_slug || null;

  // Top-tier — nothing to recover. Component renders the "monitor drift" state.
  if (classification === "already_optimized") {
    return { state: "already_optimized", recoverable_annual: null, recommendations: [] };
  }
  // We can't defend a number — neutral state, never invent recs.
  if (classification === "insufficient_data" || !isFinite(current) || !isFinite(achievable)) {
    return { state: "insufficient_data", recoverable_annual: null, recommendations: [] };
  }

  // ── SINGLE POOL — the ONE recoverable figure, taken verbatim from the engine
  //    (same object the hero renders). Never recomputed here.
  const pool = engineResult?.annual_savings_eur;
  const poolPoint = Number(pool?.point);
  if (!isFinite(poolPoint) || poolPoint < MATERIAL_ANNUAL_EUR) {
    // Below materiality — no honest roadmap to show.
    return { state: "insufficient_data", recoverable_annual: null, recommendations: [] };
  }

  // ── SINGLE TARGET — the engine's achievable rate. NOT a rate-table minimum.
  const target_bps = achievable;

  // ── AMBITION (upside) — neutral aggregate proof of headroom, NO hard €.
  //    marketRange gives the best/mid effective rate in the cohort at the
  //    merchant's ticket. We surface ONLY the low end as ambition copy
  //    ("brands in your tier reach ~X%") and ONLY when it's actually below the
  //    engine's achievable target (otherwise there's no headroom to talk about).
  //    Provider is discarded — no PSP name ever leaves this block.
  let ambition_bps = null;
  if (Array.isArray(rateTable) && isFinite(ticket) && ticket > 0) {
    const range = marketRange(rateTable, region, channel, ticket, providerSlug);
    if (range && isFinite(range.lowBps) && range.lowBps < target_bps) {
      ambition_bps = range.lowBps;
    }
  }

  // ── ROUTES — the HOW. No per-rec €. Order: renegotiate (easiest, highest
  //    confidence) → better rate → connect (estimated only).
  const recs = [];

  // Route A — renegotiate the processor margin (same PSP, no migration).
  recs.push({
    id: "recover_margin",
    title: "Renegociamos tu margen",
    confidence: cohortVerified ? "high" : "medium",
    effort: "low",
    priority: "high",
    cta_intent: "managed_migration",
  });

  // Route B — CAMBRA takes you to a better rate via the collective. Confidence
  // follows the cohort's evidence quality (verified row → high, fallback → low
  // + caveat). This is a ROUTE to the same pool — it does NOT carry its own €.
  recs.push({
    id: "better_rate",
    title: "Te llevamos a un rate mejor",
    confidence: cohortVerified ? "high" : "low",
    effort: "medium",
    priority: "medium",
    ...(cohortVerified ? {} : { caveat: "Objetivo estimado a partir de rangos de mercado, sujeto a verificación." }),
    cta_intent: "collective",
  });

  // Route C — connect to verify (estimated mode only). Disappears once the
  // number is measured from real PSP data.
  if (mode !== "verified") {
    recs.push({
      id: "connect_verify",
      title: "Conecta para verificar y arrancamos",
      confidence: "high",   // the ACTION is certain
      effort: "low",
      priority: "medium",
      cta_intent: "connect_verify",
    });
  }

  return {
    state: "savings_opportunity",
    // The ONE figure — the hero pool verbatim (lo/point/hi). Surfaced once.
    recoverable_annual: {
      lo: Number(pool.lo),
      point: poolPoint,
      hi: Number(pool.hi),
    },
    target_bps,
    ...(ambition_bps != null ? { ambition_bps } : {}),
    recommendations: recs,
  };
}

export { MATERIAL_ANNUAL_EUR, effectiveBpsAtTicket, findBestMarketRate, marketRange };
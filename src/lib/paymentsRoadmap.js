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

// buildRecoveryRoadmap — derive the ordered recommendation list.
//
// Contract:
//   engineResult: full engine_result (reads current/achievable bps, cohort,
//     classification, annual_savings_eur, mode). Never mutated.
//   inputSnapshot: { monthly_gmv_eur, avg_ticket_eur, provider_slug, country }.
//   rateTable: PaymentsRateTable rows (INTERNAL sizing only). Optional — when
//     absent, the "better rate" rec is simply omitted (never invented).
//
// Returns:
//   { state: 'already_optimized', recommendations: [] }        // top-tier
//   { state: 'insufficient_data', recommendations: [] }        // no honest recs
//   { state: 'savings_opportunity', recommendations: [ Rec... ] }
//
// Rec shape (each field traces to data — NO invented numbers, NO provider name):
//   {
//     id,                       // stable key
//     title,                    // CAMBRA-framed ("we recover ..."), no PSP name
//     annual_eur | annual_range // point €/yr, or {lo,hi} when confidence is low
//     confidence: 'high'|'medium'|'low',
//     effort: 'low'|'medium'|'high',
//     priority: 'high'|'medium'|'low',
//     target_rate_bps?,         // NEUTRAL target ("~X%"), no provenance
//     market_low_bps?, market_mid_bps?, // aggregate proof, no provider name
//     caveat?,                  // "estimated, subject to verification" when low conf
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
  const gmv = Number(inputSnapshot?.monthly_gmv_eur);
  const ticket = Number(inputSnapshot?.avg_ticket_eur);
  const providerSlug = inputSnapshot?.provider_slug || null;
  const annualPoint = Number(engineResult?.annual_savings_eur?.point);

  // Top-tier — nothing to recover. Component renders the "monitor drift" state.
  if (classification === "already_optimized") {
    return { state: "already_optimized", recommendations: [] };
  }
  // We can't defend a number — neutral state, never invent recs.
  if (classification === "insufficient_data" || !isFinite(current) || !isFinite(achievable)) {
    return { state: "insufficient_data", recommendations: [] };
  }

  const recs = [];

  // ── Rec 1 — RECOVER PROCESSOR MARGIN (same PSP, no migration) ──────────────
  // €/yr = gap (current - achievable) applied to GMV. This is the engine's own
  // number — we prefer the engine's annual point when present, else recompute
  // from the bps gap (identical arithmetic).
  const marginAnnual = isFinite(annualPoint) && annualPoint > 0
    ? annualPoint
    : eurFromBpsGap(current - achievable, gmv);
  if (marginAnnual >= MATERIAL_ANNUAL_EUR) {
    recs.push({
      id: "recover_margin",
      title: "Recuperamos el margen de tu procesador",
      annual_eur: marginAnnual,
      confidence: cohortVerified ? "high" : "medium",
      effort: "low",
      priority: "high",
      cta_intent: "managed_migration",
    });
  }

  // ── Rec 2 — CAMBRA TAKES YOU TO A BETTER RATE (internal sizing only) ───────
  // Sized against the best market rate at the merchant's ticket — but the
  // provider is DISCARDED. We surface only the NEUTRAL target rate + the
  // AGGREGATE market range as proof. Confidence downgrades + caveat when the
  // best evidence is a fallback (verified:false) row.
  if (Array.isArray(rateTable) && isFinite(current) && isFinite(ticket) && ticket > 0 && isFinite(gmv) && gmv > 0) {
    const best = findBestMarketRate(rateTable, region, channel, ticket, providerSlug);
    const range = marketRange(rateTable, region, channel, ticket, providerSlug);
    if (best && best.effectiveBps < current) {
      const betterAnnual = eurFromBpsGap(current - best.effectiveBps, gmv);
      if (betterAnnual >= MATERIAL_ANNUAL_EUR) {
        const lowConf = !best.verified;
        recs.push({
          id: "better_rate",
          title: "CAMBRA te lleva a un rate mejor",
          // Low-confidence evidence → present the saving as a RANGE, never a
          // false-precision point. Honesty guard.
          ...(lowConf
            ? { annual_range: { lo: betterAnnual * 0.6, hi: betterAnnual } }
            : { annual_eur: betterAnnual }),
          confidence: best.verified ? "high" : "low",
          effort: "medium",
          priority: betterAnnual > marginAnnual ? "high" : "medium",
          // NEUTRAL target rate — no provenance, no provider. "~X%".
          target_rate_bps: best.effectiveBps,
          // Aggregate proof — cohort range, no provider names.
          ...(range ? { market_low_bps: range.lowBps, market_mid_bps: range.midBps } : {}),
          ...(lowConf ? { caveat: "Estimado a partir de rangos de mercado, sujeto a verificación." } : {}),
          cta_intent: "collective",
        });
      }
    }
  }

  // ── Rec 3 — CONNECT TO VERIFY (estimated mode only, no €) ──────────────────
  // Disappears in verified mode — the number is already measured there.
  if (mode !== "verified") {
    recs.push({
      id: "connect_verify",
      title: "Conecta para verificar y arrancamos la recuperación",
      confidence: "high",       // the ACTION is certain; there's no € claim
      effort: "low",
      priority: "medium",
      cta_intent: "connect_verify",
    });
  }

  // Order by €/year desc (recs without a € figure sort last), tie-break by
  // lower effort. connect_verify has no € → naturally sinks below the sized recs.
  const annualOf = (r) =>
    isFinite(r.annual_eur) ? r.annual_eur
      : r.annual_range ? r.annual_range.hi
      : -1;
  recs.sort((a, b) => {
    const d = annualOf(b) - annualOf(a);
    if (d !== 0) return d;
    return (EFFORT[a.effort] || 9) - (EFFORT[b.effort] || 9);
  });

  return { state: "savings_opportunity", recommendations: recs };
}

export { MATERIAL_ANNUAL_EUR, effectiveBpsAtTicket, findBestMarketRate, marketRange };
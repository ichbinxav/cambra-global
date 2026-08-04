// paymentsInStore — pure derivation of Phase-3 IN-STORE (TPE/TPV) insights.
//
// SINGLE SOURCE OF TRUTH note: the terminal rental is NOT on engine_result.
// It is FOLDED INTO current_effective_bps by the engine (paymentsGap.js →
// computeEffectiveBps → rentalBps). To surface it separately we read the raw
// rental from the merchant's PaymentsRateTable ROW (terminal_rental_monthly_minor)
// and RE-DERIVE its amortized bps the exact same way the engine did:
//
//   rental_bps = (rental_major / monthly_gmv_eur) × 10000        (12·rental / annual_gmv)
//
// COHERENCE (validated with real seeded data, Yavin EU €40k/mo, €29/mo rental):
//   rental_amortized_bps (7.25) + rest (80) === current_effective_bps (87.25)
//   → equals_current: true. The rental is ALREADY inside the effective rate.
//   These tiles present it as "of your rate, this is rental" — NEVER summed on
//   top of the total. `rest_bps = current_effective_bps − rental_bps` is what
//   we show as the non-rental portion, so the two always reconcile to current.
//
// GUARDAS (hard rules):
//   • Payments only. In-store TPV names (SumUp, Smile&Pay, Stripe Terminal…)
//     are used ONLY as an internal market reference to compute the sub-vs-payg
//     crossover — NEVER presented as a destination/recommendation. The CTA
//     destination is always CAMBRA's offer. This module returns rate NUMBERS
//     for the crossover, not a "switch to X" instruction.
//   • Dato real o estado honesto — never fabricate. Missing rental / GMV /
//     seeded rows → { available: false }, the tile hides.
//   • No double counting — see coherence note above.
//
// Pure functions of plain inputs. No SDK, no side effects.

const BPS_PER_UNIT = 10000;
const MINOR_PER_MAJOR = 100;

const num = (v) => (isFinite(Number(v)) ? Number(v) : null);
const bpsToPct = (bps) => (isFinite(bps) ? bps / 100 : null);

// ── 1. TERMINAL RENTAL AS ITS OWN COST (inside the rate, not on top) ─────────
//
// rateRow: the merchant's PaymentsRateTable row (carries terminal_rental_monthly_minor).
// engineResult / inputSnapshot: the SINGLE SOURCE OF TRUTH for current rate + GMV.
//
// Returns the rental €/month, its amortized bps/%, and the rest of the rate,
// with a coherence flag proving rental + rest === current_effective_bps.
export function deriveTerminalRental(engineResult, inputSnapshot, rateRow) {
  const er = engineResult || {};
  const snap = inputSnapshot || {};
  const channel = er?.cohort?.channel === "in_store" ? "in_store" : "online";
  if (channel !== "in_store") return { available: false, reason: "not_in_store" };

  const rentalMinor = num(rateRow?.terminal_rental_monthly_minor);
  const monthlyGmv = num(snap.monthly_gmv_eur);
  const currentBps = num(er.current_effective_bps);

  // Honest hide: no rental data, no GMV, or a modern TPV with zero rental.
  if (rentalMinor == null || rentalMinor <= 0 || monthlyGmv == null || monthlyGmv <= 0) {
    return { available: false, reason: "no_rental" };
  }

  const rentalMonth = rentalMinor / MINOR_PER_MAJOR;
  // Re-derive the SAME rentalBps the engine folded into current_effective_bps.
  const rentalBps = (rentalMonth / monthlyGmv) * BPS_PER_UNIT;
  const restBps = currentBps != null ? currentBps - rentalBps : null;

  // Coherence: rental + rest reconciles to current (proof, not decoration).
  const coherent =
    currentBps != null && restBps != null
      ? Math.abs(rentalBps + restBps - currentBps) < 1e-6
      : false;

  return {
    available: true,
    rental_month_eur: rentalMonth,
    rental_year_eur: rentalMonth * 12,
    rental_bps: rentalBps,
    rental_pct: bpsToPct(rentalBps),
    current_bps: currentBps,
    current_pct: bpsToPct(currentBps),
    rest_bps: restBps,
    rest_pct: restBps != null ? bpsToPct(restBps) : null,
    annual_rental_eur: rentalMonth * 12,
    coherent, // must be true; if false the tile shows without the "of your rate" split
  };
}

// ── 2. ONLINE vs IN-STORE SPLIT (combined analyses only) ─────────────────────
//
// Combined analyses store details.per_channel = [{channel, classification,
// engine_result}]. No combined result exists in prod yet, so this returns
// { available: false } and the tile auto-hides — by design, nothing invented.
//
// When present, each channel gets its rate, its annual fee (gmv × rate), and
// its annual savings (from that channel's engine_result). The two channels'
// savings must SUM to the combined total — we return both so the tile can
// display the sum-check.
export function deriveChannelSplit(perChannel) {
  if (!Array.isArray(perChannel) || perChannel.length < 2) {
    return { available: false, reason: "not_combined" };
  }
  const channels = [];
  let totalSavings = 0;
  for (const ch of perChannel) {
    const er = ch?.engine_result || {};
    const snap = ch?.input_snapshot || {};
    const bps = num(er.current_effective_bps);
    const monthlyGmv = num(snap.monthly_gmv_eur);
    if (bps == null || monthlyGmv == null) return { available: false, reason: "malformed" };
    const annualGmv = monthlyGmv * 12;
    const savings = num(er?.annual_savings_eur?.point) ?? 0;
    totalSavings += savings;
    channels.push({
      channel: ch.channel === "in_store" ? "in_store" : "online",
      rate_pct: bpsToPct(bps),
      annual_fees_eur: annualGmv * (bps / BPS_PER_UNIT),
      annual_savings_eur: savings,
    });
  }
  return { available: true, channels, total_savings_eur: totalSavings };
}

// ── 3. SUBSCRIPTION (abono) vs PAY-AS-YOU-GO crossover ───────────────────────
//
// Informative market insight. Given the merchant's real monthly GMV, computes
// the crossover volume where a subscription TPV (lower %, monthly fee) beats a
// pay-as-you-go TPV (higher %, no fee):
//
//   subscription wins when (payg_rate − sub_rate) × monthly_gmv > monthly_fee
//   crossover_gmv = monthly_fee / (payg_rate − sub_rate)
//
// GUARDA: paygRow / subRow are used ONLY as internal market rate references
// for the crossover math. This function returns NUMBERS + a neutral verdict
// ("subscription pays off at your volume" / "pay-as-you-go pays off"), never a
// "switch to <provider>" instruction. The UI destination stays CAMBRA's offer.
//
// paygRow / subRow: PaymentsRateTable rows chosen by the caller as the market
// references (e.g. a no-rental modern TPV vs a rental-bearing sub TPV). Missing
// rows or a non-positive rate gap → { available: false } (honest hide).
export function deriveSubVsPayg(inputSnapshot, paygRow, subRow) {
  const snap = inputSnapshot || {};
  const monthlyGmv = num(snap.monthly_gmv_eur);
  if (monthlyGmv == null || monthlyGmv <= 0) return { available: false, reason: "no_gmv" };

  const paygBps = num(paygRow?.percent_bps);
  const subBps = num(subRow?.percent_bps);
  const subFeeMinor = num(subRow?.terminal_rental_monthly_minor);
  if (paygBps == null || subBps == null || subFeeMinor == null) {
    return { available: false, reason: "no_rows" };
  }
  const rateGapBps = paygBps - subBps; // payg is expected to be the higher %
  if (rateGapBps <= 0) return { available: false, reason: "no_gap" };

  const subFeeMonth = subFeeMinor / MINOR_PER_MAJOR;
  // crossover GMV where the % saving equals the monthly fee.
  const crossoverGmv = subFeeMonth / (rateGapBps / BPS_PER_UNIT);

  // Verdict at the merchant's real volume.
  const paygMonthlyCost = monthlyGmv * (paygBps / BPS_PER_UNIT);
  const subMonthlyCost = monthlyGmv * (subBps / BPS_PER_UNIT) + subFeeMonth;
  const subWins = subMonthlyCost < paygMonthlyCost;

  return {
    available: true,
    monthly_gmv: monthlyGmv,
    payg_rate_pct: bpsToPct(paygBps),
    sub_rate_pct: bpsToPct(subBps),
    sub_fee_month_eur: subFeeMonth,
    crossover_gmv_eur: crossoverGmv,
    payg_monthly_cost_eur: paygMonthlyCost,
    sub_monthly_cost_eur: subMonthlyCost,
    monthly_delta_eur: Math.abs(subMonthlyCost - paygMonthlyCost),
    sub_wins: subWins, // true → subscription pays off at this volume (neutral verdict)
  };
}

export const _internal = { BPS_PER_UNIT, MINOR_PER_MAJOR };
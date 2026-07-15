// paymentsInsights — pure derivation of Phase-1 "data insights" from the
// SINGLE SOURCE OF TRUTH (engine_result + input_snapshot).
//
// GUARDAS (hard rules encoded here):
//   • Payments only. No external PSP names. No over-promising.
//   • ONE source: every number derives from engine_result / input_snapshot —
//     never recomputed against a different model, never fabricated.
//   • NEVER fabricate: no per-country split (only domestic/intl via intl_pct),
//     no fine card types (only debit/credit via card_mix_debit_pct), no real
//     monthly trend (that needs Stripe), no drift (needs scan history).
//   • Coherence: the layer/segment decomposition SUMS to total fees — no
//     double counting. effective rate, breakdown, gap, savings are the SAME
//     numbers the report already shows.
//
// Everything here is a pure function of plain inputs. No SDK, no side effects.
// `available: false` on any insight means "we honestly don't have the data" —
// the UI must render a connect-teaser or hide it, NEVER invent a number.

// ── constants ───────────────────────────────────────────────────────────────
const BPS_PER_UNIT = 10000;
// EU Interchange Fee Regulation (2015/751) caps: debit 0.20%, credit 0.30%.
// Used ONLY for the "your debit should cost ~0.20%" honesty note — never to
// compute savings (that stays engine-owned).
const IFR_DEBIT_BPS = 20;
const IFR_CREDIT_BPS = 30;

// ── helpers ───────────────────────────────────────────────────────────────
const num = (v) => (isFinite(Number(v)) ? Number(v) : null);
const bpsToPct = (bps) => (isFinite(bps) ? bps / 100 : null);

// Parse the achievable composition (interchange/scheme/margin bps) out of the
// engine's assumptions — same string the engine emits and FeeBreakdownCard
// already parses. Online only; in-store has no auditable split.
function parseAchievableBreakdown(assumptions) {
  const line = (assumptions || []).find(
    (a) => typeof a === "string" && a.startsWith("Achievable rate composition:")
  );
  if (!line) return null;
  const re = /interchange (\d+(?:\.\d+)?) bps \+ scheme fees (\d+(?:\.\d+)?) bps \+ assumed processor margin (\d+(?:\.\d+)?) bps \(±(\d+(?:\.\d+)?) bps assumption\)/;
  const m = line.match(re);
  if (!m) return null;
  return {
    interchange_bps: Number(m[1]),
    scheme_fees_bps: Number(m[2]),
    processor_margin_bps: Number(m[3]),
    processor_margin_band_bps: Number(m[4]),
  };
}

// Parse the intl uplift note ("+X.XX% uplift on the current rate") so the
// cross-border insight can attribute fees to the intl portion. Both numbers
// come from the engine assumption (which itself comes from the rate row).
function parseIntlUplift(assumptions) {
  const line = (assumptions || []).find(
    (a) => typeof a === "string" && a.includes("cross-border") && a.includes("uplift on the current rate")
  );
  if (!line) return null;
  const m = line.match(/\+(\d+(?:\.\d+)?)% uplift on the current rate/);
  if (!m) return null;
  return { current_uplift_bps: Number(m[1]) * 100 };
}

// ── main ────────────────────────────────────────────────────────────────────
//
// Returns a flat object of insights. Each field is either a concrete value or
// { available: false, reason } when we honestly lack the data.
export function derivePaymentsInsights(engineResult, inputSnapshot) {
  const er = engineResult || {};
  const snap = inputSnapshot || {};

  const currentBps = num(er.current_effective_bps);
  const achievableBps = num(er.achievable_effective_bps);
  const monthlyGmv = num(snap.monthly_gmv_eur);
  const avgTicket = num(snap.avg_ticket_eur);
  const intlPct = num(snap.intl_pct);
  const debitPct = num(snap.card_mix_debit_pct);
  const channel = er?.cohort?.channel === "in_store" ? "in_store" : "online";

  const annualGmv = monthlyGmv != null ? monthlyGmv * 12 : null;

  // ── 1. TOTAL FEES PAID (gross cost — NOT the savings) ─────────────────────
  // total_fees = GMV × current_effective_rate. This is what you pay today.
  const totalFees =
    annualGmv != null && currentBps != null
      ? {
          available: true,
          annual: annualGmv * (currentBps / BPS_PER_UNIT),
          monthly: monthlyGmv * (currentBps / BPS_PER_UNIT),
        }
      : { available: false };

  // ── 2. GMV + EFFECTIVE % ("X% of your GMV goes to fees") ──────────────────
  const gmvEffective =
    monthlyGmv != null && currentBps != null
      ? {
          available: true,
          monthly_gmv: monthlyGmv,
          annual_gmv: annualGmv,
          effective_pct: bpsToPct(currentBps),
        }
      : { available: false };

  // ── 3. ACHIEVABLE FLOOR, DECOMPOSED (interchange + scheme + NEGOTIABLE margin) ─
  // Online only (auditable split). This is the composition of the ACHIEVABLE
  // rate — the floor you could reach — NOT your current blended rate. The three
  // layers (interchange + scheme + margin) sum to the achievable percent rate;
  // the margin layer is the ONLY negotiable piece and is exactly what CAMBRA
  // recovers. €/layer/year = layer bps × annual GMV. Coherence: these numbers
  // describe the achievable floor's makeup, and are labeled as such in the UI —
  // never conflated with the (higher) current-rate total-fees figure.
  const composition = parseAchievableBreakdown(er.assumptions);
  const layered =
    composition && annualGmv != null && channel === "online"
      ? {
          available: true,
          achievable_bps: achievableBps,
          margin_recoverable_annual:
            annualGmv * (composition.processor_margin_bps / BPS_PER_UNIT),
          layers: [
            {
              key: "interchange",
              bps: composition.interchange_bps,
              annual_eur: annualGmv * (composition.interchange_bps / BPS_PER_UNIT),
              negotiable: false,
            },
            {
              key: "scheme",
              bps: composition.scheme_fees_bps,
              annual_eur: annualGmv * (composition.scheme_fees_bps / BPS_PER_UNIT),
              negotiable: false,
            },
            {
              key: "margin",
              bps: composition.processor_margin_bps,
              band_bps: composition.processor_margin_band_bps,
              annual_eur: annualGmv * (composition.processor_margin_bps / BPS_PER_UNIT),
              negotiable: true,
            },
          ],
        }
      : { available: false, reason: channel === "in_store" ? "in_store" : "no_composition" };

  // ── 4. CARD MIX & COST (debit/credit + domestic/intl, €/segment) ──────────
  // Only the two splits we actually have: debit/credit (card_mix_debit_pct)
  // and domestic/intl (intl_pct). NEVER a per-country or fine card-type split.
  // €/segment attributes CURRENT fees proportionally to GMV share — sums to
  // total fees (coherence). IFR note flags debit overpay when billed blended.
  const debitCredit =
    debitPct != null && annualGmv != null && currentBps != null
      ? (() => {
          const creditPct = 100 - debitPct;
          const feePerYear = annualGmv * (currentBps / BPS_PER_UNIT);
          const debitFees = feePerYear * (debitPct / 100);
          const creditFees = feePerYear * (creditPct / 100);
          // IFR overpay: what the debit portion SHOULD cost at the 0.20% cap
          // vs what it costs at your blended rate. Only meaningful when your
          // blended rate exceeds the debit cap (i.e. you're billed blended).
          const debitGmv = annualGmv * (debitPct / 100);
          const idealDebitFees = debitGmv * (IFR_DEBIT_BPS / BPS_PER_UNIT);
          const debitOverpay = Math.max(0, debitFees - idealDebitFees);
          return {
            available: true,
            debit_pct: debitPct,
            credit_pct: creditPct,
            debit_fees_annual: debitFees,
            credit_fees_annual: creditFees,
            ifr_debit_pct: IFR_DEBIT_BPS / 100,
            ifr_credit_pct: IFR_CREDIT_BPS / 100,
            debit_overpay_annual: debitOverpay,
          };
        })()
      : { available: false };

  const domesticIntl =
    intlPct != null && annualGmv != null && currentBps != null
      ? (() => {
          const domesticPct = 100 - intlPct;
          const feePerYear = annualGmv * (currentBps / BPS_PER_UNIT);
          return {
            available: true,
            domestic_pct: domesticPct,
            intl_pct: intlPct,
            domestic_fees_annual: feePerYear * (domesticPct / 100),
            intl_fees_annual: feePerYear * (intlPct / 100),
          };
        })()
      : { available: false };

  // ── 5. COST PER TRANSACTION + TX/MONTH ────────────────────────────────────
  // cost/tx = effective_rate × ticket (+ the fixed component is already inside
  // effective via amortization, so effective×ticket is the all-in per-tx cost).
  // tx/month = GMV / ticket.
  const perTransaction =
    avgTicket != null && currentBps != null && monthlyGmv != null
      ? {
          available: true,
          cost_per_tx: avgTicket * (currentBps / BPS_PER_UNIT),
          tx_per_month: avgTicket > 0 ? monthlyGmv / avgTicket : null,
          avg_ticket: avgTicket,
        }
      : { available: false };

  // ── 6. CROSS-BORDER COST (intl_pct × uplift × GMV) ────────────────────────
  // The € attributable specifically to the cross-border uplift on intl volume.
  // Uses the uplift the engine actually modeled (from assumptions). When the
  // cohort has no modeled uplift, we honestly report not-modeled.
  const uplift = parseIntlUplift(er.assumptions);
  const crossBorder =
    intlPct != null && intlPct > 0 && annualGmv != null
      ? uplift
        ? {
            available: true,
            intl_pct: intlPct,
            uplift_pct: bpsToPct(uplift.current_uplift_bps),
            annual_eur: annualGmv * (intlPct / 100) * (uplift.current_uplift_bps / BPS_PER_UNIT),
          }
        : { available: false, reason: "not_modeled", intl_pct: intlPct }
      : { available: false, reason: intlPct === 0 ? "no_intl" : "no_data" };

  // ── 8. FIXED-FEE DRAG (weight of the per-tx fixed fee at your ticket) ──────
  // The fixed fee's contribution to the effective rate, isolated. We recover
  // it from the amortization note the engine emits. Honest note: "at €{ticket},
  // the fixed fee adds ~X% effective".
  const fixedNote = (er.assumptions || []).find(
    (a) => typeof a === "string" && a.startsWith("Fixed fee of")
  );
  let fixedDrag = { available: false };
  if (fixedNote && avgTicket != null && avgTicket > 0) {
    const m = fixedNote.match(/Fixed fee of (\d+(?:\.\d+)?)/);
    if (m) {
      const fixedMajor = Number(m[1]);
      const dragBps = (fixedMajor / avgTicket) * BPS_PER_UNIT;
      fixedDrag = {
        available: true,
        fixed_fee_eur: fixedMajor,
        avg_ticket: avgTicket,
        drag_pct: bpsToPct(dragBps),
      };
    }
  }

  return {
    channel,
    totalFees,        // 1
    gmvEffective,     // 2
    layered,          // 3
    debitCredit,      // 4a
    domesticIntl,     // 4b
    perTransaction,   // 5
    crossBorder,      // 6
    fixedDrag,        // 8
    // 7 (gap to peer median) lives in PeerBenchmark which already reads the
    // benchmark table — kept there to avoid duplicating the benchmark source.
  };
}

export const _internal = { parseAchievableBreakdown, parseIntlUplift, IFR_DEBIT_BPS, IFR_CREDIT_BPS };
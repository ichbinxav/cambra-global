// PaymentsGapCard — the hero card of PaymentsResults.
//
// Shows:
//   - The current effective rate (blended %) vs the achievable rate.
//   - The annual savings RANGE (lo–hi). Never the point alone — that's a
//     hard requirement of the product: single-number precision would be
//     dishonest for an estimate.
//
// Basis-points math note: engine returns effective bps (percent_bps +
// amortized fixed fee). To render as a human "%" we divide by 100
// (1 bps = 0.01%). We ALWAYS use the engine's numbers directly — never
// recompute here.

function pctFromBps(bps) {
  if (!isFinite(bps)) return "—";
  return (bps / 100).toFixed(2) + "%";
}

function eur(n) {
  if (!isFinite(n)) return "—";
  return "€" + Math.round(n).toLocaleString("en-US");
}

export default function PaymentsGapCard({ engineResult, inputSnapshot, sampleMetrics, measurementWindow, compact = false }) {
  const current = engineResult?.current_effective_bps;
  const achievable = engineResult?.achievable_effective_bps;
  const annual = engineResult?.annual_savings_eur || {};
  const monthly = engineResult?.monthly_savings_eur || {};
  const cohortVerifiedRow = engineResult?.cohort?.verified === true;
  // M3-Chunk 7 — the ONLY badge in the app that reads "VERIFIED" (Vocabulary
  // Rule, Decision_Log 2026-07-09). Gated on engine_result.mode, which the
  // motor stamps as "verified" ONLY when computeStripeVerifiedGap ran on
  // real Stripe balance-transaction data. The form path never reaches
  // mode==="verified" — it stops at "estimated".
  const isMeasured = engineResult?.mode === "verified";
  // M4-TPV Fase 2B — channel from cohort. Default 'online' preserves pre-M4
  // behavior for legacy verified rows without the field.
  const channel = engineResult?.cohort?.channel === "in_store" ? "in_store" : "online";

  const gapPct = isFinite(current) && isFinite(achievable) ? ((current - achievable) / 100).toFixed(2) : null;
  const txCount = sampleMetrics?.tx_count_charges_90d;
  const daysCovered = measurementWindow?.days_covered;

  return (
    <div
      className="rounded-3xl p-6 md:p-8"
      style={{
        background: "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.015) 100%)",
        border: "1px solid rgba(255,255,255,0.10)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
    >
      {/* Eyebrow — cohort label + verification tier.
          VOCABULARY RULE (Decision_Log 2026-07-09 + M3-Chunk 7): the word
          "VERIFIED" is RESERVED in this app for analyses backed by REAL
          CONNECTED DATA (mode === "verified"). Three tiers, one truth:
            engine_result.mode === "verified" → "VERIFIED"        (measured)
            cohort.verified === true          → "PUBLIC PRICING"  (estimated)
            cohort.verified === false         → "REGIONAL ESTIMATE"
          Order matters: mode check FIRST — a verified row still carries
          cohort.verified === true from its rate-table row, so without the
          mode gate every verified analysis would land on the weaker badge. */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-[10px] uppercase tracking-[0.22em] font-bold text-white/55">
          Payments gap · {inputSnapshot?.country || "—"}
        </span>
        {/* M4-TPV Fase 2B — channel pill (in-store / online). Only shown for
            in_store to keep online results visually unchanged (default state). */}
        {channel === "in_store" && (
          <span
            title="Analysis based on in-store (physical terminal) payment rates."
            className="text-[9px] uppercase tracking-[0.14em] font-bold px-2 py-0.5 rounded-full"
            style={{
              background: "rgba(168,85,247,0.12)",
              color: "rgb(216,180,254)",
              border: "1px solid rgba(168,85,247,0.35)",
            }}
          >
            In-store
          </span>
        )}
        {isMeasured ? (
          <span
            title="Measured from your real Stripe transaction data over the last 90 days."
            className="text-[9px] uppercase tracking-[0.14em] font-black px-2 py-0.5 rounded-full inline-flex items-center gap-1"
            style={{
              background: "linear-gradient(135deg, rgba(34,211,238,0.22) 0%, rgba(59,130,246,0.18) 100%)",
              color: "rgb(103,232,249)",
              border: "1px solid rgba(34,211,238,0.55)",
              boxShadow: "0 0 12px rgba(34,211,238,0.25)",
            }}
          >
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Verified
          </span>
        ) : cohortVerifiedRow ? (
          <span
            title="Calculated against your PSP's publicly published pricing."
            className="text-[9px] uppercase tracking-[0.14em] font-bold px-2 py-0.5 rounded-full"
            style={{ background: "rgba(34,211,238,0.12)", color: "rgb(34,211,238)", border: "1px solid rgba(34,211,238,0.35)" }}
          >
            Public pricing
          </span>
        ) : (
          <span
            title="No public pricing available for this cohort — we used regional averages."
            className="text-[9px] uppercase tracking-[0.14em] font-bold px-2 py-0.5 rounded-full"
            style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.65)", border: "1px solid rgba(255,255,255,0.15)" }}
          >
            Regional estimate
          </span>
        )}
      </div>

      {/* Annual savings — the hero. UNIFIED PRESENTATION (2026-07-13): the big
          figure is the POINT estimate (same number the Dashboard shows), with
          the lo–hi RANGE band directly underneath as the confidence band. This
          keeps Dashboard and Results visually identical. When the point is
          missing (legacy rows), we fall back to the range as the headline. */}
      <p className="text-[13px] text-white/55 mb-2">You're overpaying by roughly</p>
      <div className="flex items-baseline gap-3 flex-wrap">
        <span
          className="text-white font-black tabular-nums"
          style={{
            fontFamily: "'Space Grotesk', 'Inter', sans-serif",
            fontSize: "clamp(44px, 10vw, 80px)",
            letterSpacing: "-0.04em",
            lineHeight: 1,
            background: "linear-gradient(135deg, #ffffff 0%, #22d3ee 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          {isFinite(annual.point) ? eur(annual.point) : `${eur(annual.lo)}–${eur(annual.hi)}`}
        </span>
        <span className="text-[13px] text-white/50">/ year</span>
      </div>
      {/* Confidence band + monthly — ONE compact line under the figure.
          The lo–hi range appears here ONLY (no longer duplicated with the
          hero fallback). When we have no real range, we still show the
          monthly figure so the line is never empty. */}
      <p className="text-[12px] text-white/45 mt-2">
        {isFinite(annual.lo) && isFinite(annual.hi) && (
          <>Range <span className="text-white/75 font-semibold tabular-nums">{eur(annual.lo)}–{eur(annual.hi)}</span> · </>
        )}
        about <span className="text-white/75 font-semibold tabular-nums">
          {isFinite(monthly.point) ? eur(monthly.point) : `${eur(monthly.lo)}–${eur(monthly.hi)}`}
        </span> a month
      </p>

      {compact ? (
        // COMPACT rate line (estimated mode) — supporting context, NOT a
        // competing hero. Current rate in muted red, achievable in cyan, so
        // it still reads "this drops in your favor" without a size duel.
        <div
          className="mt-6 flex items-center gap-2.5 flex-wrap rounded-xl px-4 py-3"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <span className="text-[10px] uppercase tracking-[0.15em] font-bold text-white/40">Effective rate</span>
          <span className="tabular-nums font-bold text-[15px] md:text-[16px]" style={{ color: "rgb(248,180,180)" }}>
            {pctFromBps(current)} today
          </span>
          <span className="text-white/35" aria-hidden="true">→</span>
          <span className="tabular-nums font-bold text-[15px] md:text-[16px]" style={{ color: "rgb(103,232,249)" }}>
            {pctFromBps(achievable)} achievable
          </span>
          {gapPct && (
            <span className="text-[12px] text-white/40">({gapPct} pts lower)</span>
          )}
        </div>
      ) : (
        // FULL rate strip (verified mode) — two cards side by side, unchanged.
        <div className="mt-6 grid grid-cols-2 gap-3">
          <div
            className="rounded-xl p-4"
            style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.20)" }}
          >
            <p className="text-[10px] uppercase tracking-[0.15em] font-bold text-red-300/80 mb-1">You pay today</p>
            <p
              className="text-white tabular-nums font-black"
              style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif", fontSize: "26px", letterSpacing: "-0.03em" }}
            >
              {pctFromBps(current)}
            </p>
            <p className="text-[10px] text-white/45 mt-0.5">
              {isMeasured && txCount && daysCovered ? (
                <>Your rate, measured from {txCount} charges over {daysCovered} days</>
              ) : (
                <>effective, on {inputSnapshot?.provider_slug || "your PSP"}</>
              )}
            </p>
          </div>

          <div
            className="rounded-xl p-4"
            style={{ background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.25)" }}
          >
            <p className="text-[10px] uppercase tracking-[0.15em] font-bold text-cyan-300/90 mb-1">You should pay</p>
            <p
              className="text-white tabular-nums font-black"
              style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif", fontSize: "26px", letterSpacing: "-0.03em" }}
            >
              {pctFromBps(achievable)}
            </p>
            <p className="text-[10px] text-white/45 mt-0.5">
              {gapPct ? `${gapPct} pts below your current rate` : "achievable rate"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
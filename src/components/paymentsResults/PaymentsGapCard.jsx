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

export default function PaymentsGapCard({ engineResult, inputSnapshot }) {
  const current = engineResult?.current_effective_bps;
  const achievable = engineResult?.achievable_effective_bps;
  const annual = engineResult?.annual_savings_eur || {};
  const monthly = engineResult?.monthly_savings_eur || {};
  const verified = engineResult?.cohort?.verified === true;

  const gapPct = isFinite(current) && isFinite(achievable) ? ((current - achievable) / 100).toFixed(2) : null;

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
      {/* Eyebrow — cohort label + public-pricing / estimate flag.
          COPY RULE (Decision_Log 2026-07-09): the word "verified" is
          RESERVED in this app for analyses backed by real connected data
          (post-PSP-connect, Fase 6+). The anonymous form path can NEVER
          call itself "verified" — what's verified is the rate-table row
          (public published pricing with a source URL), not the user's
          actual effective rate. So:
            cohort.verified === true  → "PUBLIC PRICING"
            cohort.verified === false → "REGIONAL ESTIMATE" */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-[10px] uppercase tracking-[0.22em] font-bold text-white/55">
          Payments gap · {inputSnapshot?.country || "—"}
        </span>
        {verified ? (
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

      {/* Annual savings range — the hero */}
      <p className="text-[13px] text-white/55 mb-2">You're overpaying by roughly</p>
      <div className="flex items-baseline gap-3 flex-wrap">
        <span
          className="text-white font-black tabular-nums"
          style={{
            fontFamily: "'Space Grotesk', 'Inter', sans-serif",
            fontSize: "clamp(40px, 9vw, 72px)",
            letterSpacing: "-0.04em",
            lineHeight: 1,
            background: "linear-gradient(135deg, #ffffff 0%, #22d3ee 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          {eur(annual.lo)}–{eur(annual.hi)}
        </span>
        <span className="text-[13px] text-white/50">/ year</span>
      </div>
      <p className="text-[12px] text-white/45 mt-2">
        That's about <span className="text-white/75 font-semibold tabular-nums">{eur(monthly.lo)}–{eur(monthly.hi)}</span> a month.
      </p>

      {/* Current vs achievable rate strip */}
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
          <p className="text-[10px] text-white/45 mt-0.5">effective, on {inputSnapshot?.provider_slug || "your PSP"}</p>
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
    </div>
  );
}
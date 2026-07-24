// CombinedGapHero — hero card for the combined (online + in-store) submit.
//
// Shows the TOTAL annual savings across channels — never the point alone,
// same rule as PaymentsGapCard (range only). Underneath, a compact row per
// channel showing its own gap point so the merchant sees where the total
// comes from.
//
// Reads verbatim from engine_result.combined structure produced by
// submitPaymentsAnalysis in Fase 3 combined mode:
//   {
//     combined: true,
//     annual_savings_eur:  { lo, point, hi },   ← sum across channels
//     monthly_savings_eur: { lo, point, hi },
//     channels: [ { channel, engine_result, input_snapshot }, ... ]
//   }

import { useTranslation } from "@/lib/i18n.jsx";

function eur(n) {
  if (!isFinite(n)) return "—";
  return "€" + Math.round(n).toLocaleString("en-US");
}

function pctFromBps(bps) {
  if (!isFinite(bps)) return "—";
  return (bps / 100).toFixed(2) + "%";
}

const CHANNEL_LABEL = {
  online: "Online",
  in_store: "In-store",
};

const CHANNEL_STYLE = {
  online: {
    bg: "rgba(34,211,238,0.06)",
    border: "rgba(34,211,238,0.25)",
    color: "rgb(103,232,249)",
  },
  in_store: {
    bg: "rgba(168,85,247,0.06)",
    border: "rgba(168,85,247,0.30)",
    color: "rgb(216,180,254)",
  },
};

export default function CombinedGapHero({ engineResult, country }) {
  const { t } = useTranslation();
  const channels = Array.isArray(engineResult?.channels) ? engineResult.channels : [];
  // M4-refinado (v1.5.0) — honest top-level totals.
  //
  // The engine already emits `annual_savings_eur` / `monthly_savings_eur` as
  // the sum across ONLY the channels classified as `savings_opportunity`
  // (see aggregateCombinedClassification). Optimized channels contribute €0
  // to the total by design — the number the merchant sees is exactly what
  // we can defend. When every channel is optimized, the total is €0, and we
  // fall back to the aggregate hero shape but with the "already_optimized"
  // top-level classification driving the copy.
  const annual = engineResult?.annual_savings_eur || {};
  const monthly = engineResult?.monthly_savings_eur || {};
  const combinedClass = engineResult?.combined_classification;
  const hasMixedState = channels.some((c) => c.engine_result?.classification === "already_optimized")
                     && channels.some((c) => c.engine_result?.classification === "savings_opportunity");

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
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-[10px] uppercase tracking-[0.22em] font-bold text-white/55">
          {t("combined_hero_eyebrow")} · {country || "—"}
        </span>
        <span
          title="Analysis combines your online (PSP) and in-store (TPV) channels."
          className="text-[9px] uppercase tracking-[0.14em] font-bold px-2 py-0.5 rounded-full"
          style={{
            background: "linear-gradient(135deg, rgba(34,211,238,0.15) 0%, rgba(168,85,247,0.15) 100%)",
            color: "rgb(212,239,255)",
            border: "1px solid rgba(255,255,255,0.20)",
          }}
        >
          {t("combined_hero_badge")}
        </span>
      </div>

      <p className="text-[13px] text-white/55 mb-2">{t("combined_hero_lead")}</p>
      <div className="flex items-baseline gap-3 flex-wrap">
        <span
          className="text-white font-black tabular-nums"
          style={{
            fontFamily: "'Space Grotesk', 'Inter', sans-serif",
            fontSize: "clamp(40px, 9vw, 72px)",
            letterSpacing: "-0.04em",
            lineHeight: 1,
            background: "linear-gradient(135deg, #ffffff 0%, #39C6F0 60%, var(--voltio-2) 100%)",
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
        <span className="text-white/75 font-semibold tabular-nums">{eur(monthly.lo)}–{eur(monthly.hi)}</span> {t("combined_hero_month_suffix")}
      </p>

      {/* Mixed-state helper — clarifies WHY the top-level number can look
          smaller than the sum of channel figures a curious merchant would
          expect. Only shown when we actually have a mixed state. */}
      {hasMixedState && (
        <p className="text-[11px] text-emerald-300/85 mt-3 leading-relaxed">
          {t("combined_mixed_total_note")}
        </p>
      )}

      {/* Per-channel breakdown strip — with mini-victory for optimized channels */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {channels.map((ch) => {
          const style = CHANNEL_STYLE[ch.channel] || CHANNEL_STYLE.online;
          const label = CHANNEL_LABEL[ch.channel] || ch.channel;
          const r = ch.engine_result || {};
          const chMonthly = r.monthly_savings_eur || {};
          const chAnnual = r.annual_savings_eur || {};
          const chClass = r.classification;
          // Mini-victory: when a channel is already_optimized, the card no
          // longer shows a €0 monetary figure (which would read as "no data"
          // rather than "you won here"). Instead it shows an emerald "✓
          // Already at the best contractable rate" pill + the current rate,
          // so the merchant sees this channel is intentionally optimized.
          if (chClass === "already_optimized") {
            return (
              <div
                key={ch.channel}
                className="rounded-xl p-4"
                style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.30)" }}
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] uppercase tracking-[0.15em] font-bold" style={{ color: "rgb(110,231,183)" }}>
                    {label}
                  </p>
                  <span className="text-[10px] text-white/40 tabular-nums">
                    {pctFromBps(r.current_effective_bps)}
                  </span>
                </div>
                <p className="text-[13px] font-bold text-emerald-300/95 mt-1 leading-snug">
                  {t("opt_channel_pill")}
                </p>
                <p className="text-[10px] text-white/45 mt-1.5">
                  {ch.input_snapshot?.provider_slug?.replace(/_/g, " ") || "—"}
                </p>
              </div>
            );
          }
          // Insufficient-data channel: honest label, no €0 figure.
          if (chClass === "insufficient_data") {
            return (
              <div
                key={ch.channel}
                className="rounded-xl p-4"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.12)" }}
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] uppercase tracking-[0.15em] font-bold text-white/60">
                    {label}
                  </p>
                  <span className="text-[10px] text-white/40 tabular-nums">
                    {pctFromBps(r.current_effective_bps)}
                  </span>
                </div>
                <p className="text-[12px] text-white/55 mt-1 leading-snug">
                  {t("insufficient_hero_title")}
                </p>
                <p className="text-[10px] text-white/40 mt-1.5">
                  {ch.input_snapshot?.provider_slug?.replace(/_/g, " ") || "—"}
                </p>
              </div>
            );
          }
          // savings_opportunity — unchanged rendering.
          return (
            <div
              key={ch.channel}
              className="rounded-xl p-4"
              style={{ background: style.bg, border: `1px solid ${style.border}` }}
            >
              <div className="flex items-center justify-between mb-1">
                <p
                  className="text-[10px] uppercase tracking-[0.15em] font-bold"
                  style={{ color: style.color }}
                >
                  {label}
                </p>
                <span className="text-[10px] text-white/40 tabular-nums">
                  {pctFromBps(r.current_effective_bps)} → {pctFromBps(r.achievable_effective_bps)}
                </span>
              </div>
              <p
                className="text-white tabular-nums font-black"
                style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif", fontSize: "22px", letterSpacing: "-0.03em" }}
              >
                {eur(chAnnual.lo)}–{eur(chAnnual.hi)}
                <span className="text-[11px] text-white/45 font-medium ml-1">/ yr</span>
              </p>
              <p className="text-[10px] text-white/45 mt-0.5">
                {eur(chMonthly.lo)}–{eur(chMonthly.hi)} / month · {ch.input_snapshot?.provider_slug?.replace(/_/g, " ") || "—"}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
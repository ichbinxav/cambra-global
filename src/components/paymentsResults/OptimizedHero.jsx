// OptimizedHero — rendered when engine_result.classification === "already_optimized".
//
// UX rules sealed with Xavi 2026-07-12 (Decision_Log_Iter4 · Chunk 2, UX
// spec for the M4-refinado classifier):
//
//   • Title reads as a VICTORY, not a "we don't know". This is the only
//     state where the merchant is actively BEING CONGRATULATED — copy must
//     land that.
//   • The primary "Stop overpaying" CTA is HIDDEN (there's nothing to stop —
//     they're already at the floor). Handled by PaymentsResults.jsx which
//     skips the cyan CTA panel entirely in this state.
//   • A single SECONDARY action ("Re-run with different inputs") gives them
//     agency without pushing a signup they don't need.
//   • Verified-row guardrail is already enforced by the engine — this
//     component NEVER sees `already_optimized` on a fallback row. So the
//     component doesn't need to hedge or add "estimate" caveats.
//   • The current rate is still surfaced so the merchant sees WHY they're
//     at the floor (their number vs. the achievable — same order as the
//     savings_opportunity hero, just without the delta).

function pctFromBps(bps) {
  if (!isFinite(bps)) return "—";
  return (bps / 100).toFixed(2) + "%";
}

export default function OptimizedHero({ engineResult, inputSnapshot, t, onRerun }) {
  const current = engineResult?.current_effective_bps;
  const achievable = engineResult?.achievable_effective_bps;
  const channel = engineResult?.cohort?.channel === "in_store" ? "in_store" : "online";

  return (
    <div
      className="rounded-3xl p-6 md:p-8"
      style={{
        background: "linear-gradient(180deg, rgba(16,185,129,0.06) 0%, rgba(16,185,129,0.015) 100%)",
        border: "1px solid rgba(16,185,129,0.25)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
    >
      {/* Eyebrow + channel pill (kept for consistency with the opportunity hero) */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-[10px] uppercase tracking-[0.22em] font-bold text-emerald-300/90">
          {t("opt_hero_eyebrow")} · {inputSnapshot?.country || "—"}
        </span>
        {channel === "in_store" && (
          <span
            className="text-[9px] uppercase tracking-[0.14em] font-bold px-2 py-0.5 rounded-full"
            style={{ background: "rgba(168,85,247,0.12)", color: "rgb(216,180,254)", border: "1px solid rgba(168,85,247,0.35)" }}
          >
            In-store
          </span>
        )}
        <span
          className="text-[9px] uppercase tracking-[0.14em] font-black px-2 py-0.5 rounded-full inline-flex items-center gap-1"
          style={{
            background: "linear-gradient(135deg, rgba(16,185,129,0.20) 0%, rgba(34,211,238,0.15) 100%)",
            color: "rgb(110,231,183)",
            border: "1px solid rgba(16,185,129,0.45)",
          }}
        >
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Optimized
        </span>
      </div>

      {/* Victory title */}
      <h1
        className="text-white mb-3"
        style={{
          fontFamily: "'Space Grotesk', 'Inter', sans-serif",
          fontSize: "clamp(32px, 6vw, 52px)",
          fontWeight: 900,
          letterSpacing: "-0.035em",
          lineHeight: 1.05,
          background: "linear-gradient(135deg, #ffffff 0%, #6ee7b7 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}
      >
        {t("opt_hero_title")}
      </h1>
      <p className="text-[14px] text-white/60 max-w-xl mb-6">{t("opt_hero_body")}</p>

      {/* Rate strip — same shape as the opportunity hero minus the delta */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl p-4" style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.30)" }}>
          <p className="text-[10px] uppercase tracking-[0.15em] font-bold text-emerald-300/90 mb-1">You pay today</p>
          <p className="text-white tabular-nums font-black" style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif", fontSize: "26px", letterSpacing: "-0.03em" }}>
            {pctFromBps(current)}
          </p>
        </div>
        <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.10)" }}>
          <p className="text-[10px] uppercase tracking-[0.15em] font-bold text-white/60 mb-1">Best contractable</p>
          <p className="text-white tabular-nums font-black" style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif", fontSize: "26px", letterSpacing: "-0.03em" }}>
            {pctFromBps(achievable)}
          </p>
        </div>
      </div>

      <p className="text-[11px] text-white/45 mt-5">{t("opt_footnote")}</p>

      {/* Secondary action only — no primary CTA in this state */}
      <button
        onClick={onRerun}
        className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-white/75 hover:text-white transition-colors"
      >
        {t("opt_hero_cta_secondary")} →
      </button>
    </div>
  );
}
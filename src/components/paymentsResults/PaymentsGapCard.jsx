// PaymentsGapCard — the hero card of PaymentsResults. Report v2 (tech).
//
// PIEZA A — Score GAUGE (ScoreGauge): amber arc that sweeps to the score % on
//   load, big number counts up, "GRADE X" underneath. Beside it the segmented
//   recovery CTA (ScoreRecoveryCTA) — C/D/F → recover, A/B → top-tier. Both
//   derive from computePaymentsScore (single source of truth — never recomputed).
//
// PIEZA B — Live figure: "You're overpaying by ~" + € count-up (cyan, glow) +
//   "/ year". Range + monthly below. Mono chip: current% → achievable%.
//
// AESTHETIC: card bg #070c16 + subtle grid overlay (radial mask). Mono numbers,
// soft glows. cyan = savings, amber = score, red = current rate.
//
// Everything numeric comes verbatim from engine_result. Payments only.

import { Lock } from "lucide-react";
import { useTranslation } from "@/lib/i18n.jsx";
import { computePaymentsScore } from "@/lib/paymentsScore.js";
import ScoreGauge from "@/components/paymentsResults/ScoreGauge";
import ScoreRecoveryCTA from "@/components/paymentsResults/ScoreRecoveryCTA";
import EuroCountUp from "@/components/paymentsResults/EuroCountUp";

const MONO = "'JetBrains Mono', ui-monospace, monospace";

// Tone token → concrete colors (same mapping as the old badge).
const TONE = {
  excellent: { text: "rgb(45,212,191)",  ring: "rgba(45,212,191,0.45)",  glow: "rgba(45,212,191,0.22)",  soft: "rgba(45,212,191,0.10)" },
  good:      { text: "rgb(96,165,250)",  ring: "rgba(96,165,250,0.45)",  glow: "rgba(96,165,250,0.22)",  soft: "rgba(96,165,250,0.10)" },
  medium:    { text: "rgb(245,181,68)",  ring: "rgba(245,181,68,0.45)",  glow: "rgba(245,181,68,0.20)",  soft: "rgba(245,181,68,0.10)" },
  risk:      { text: "rgb(248,113,113)", ring: "rgba(248,113,113,0.45)", glow: "rgba(248,113,113,0.20)", soft: "rgba(248,113,113,0.10)" },
};

function pctFromBps(bps) {
  if (!isFinite(bps)) return "—";
  return (bps / 100).toFixed(2) + "%";
}

function eur(n) {
  if (!isFinite(n)) return "—";
  return "€" + Math.round(n).toLocaleString("en-US");
}

export default function PaymentsGapCard({ engineResult, inputSnapshot, sampleMetrics, measurementWindow, compact = false, isAnonymous = false, onScoreCTA }) {
  const { t } = useTranslation();
  const current = engineResult?.current_effective_bps;
  const achievable = engineResult?.achievable_effective_bps;
  // UX-1 T2 — the anonymous teaser no longer ships the achievable rate
  // (getPaymentsGapTeaser returns null). Render a locked state instead.
  const achievableLocked = !isFinite(achievable);
  const annual = engineResult?.annual_savings_eur || {};
  const monthly = engineResult?.monthly_savings_eur || {};
  const cohortVerifiedRow = engineResult?.cohort?.verified === true;
  const isMeasured = engineResult?.mode === "verified";
  const channel = engineResult?.cohort?.channel === "in_store" ? "in_store" : "online";

  const gapPct = isFinite(current) && isFinite(achievable) ? ((current - achievable) / 100).toFixed(2) : null;
  const txCount = sampleMetrics?.tx_count_charges_90d;
  const daysCovered = measurementWindow?.days_covered;

  // Score (single source of truth) — drives the gauge + CTA.
  const scoreResult = computePaymentsScore(engineResult);
  const scoreAvailable = scoreResult.available;
  const tone = scoreResult.tone || "medium";
  const toneColors = TONE[tone] || TONE.medium;
  const scoreMuted = scoreAvailable && !scoreResult.verified;

  return (
    <div
      className="relative rounded-3xl p-6 md:p-8 overflow-hidden"
      style={{
        background: "#070c16",
        border: "1px solid rgba(255,255,255,0.09)",
        boxShadow: "0 24px 64px -28px rgba(0,0,0,0.7)",
      }}
    >
      {/* Subtle tech grid overlay — radial mask fades it toward the edges. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(#0d1a30 1px, transparent 1px), linear-gradient(90deg, #0d1a30 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          opacity: 0.6,
          maskImage: "radial-gradient(ellipse 95% 85% at 50% 25%, #000 30%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 95% 85% at 50% 25%, #000 30%, transparent 100%)",
        }}
      />

      <div className="relative z-10">
        {/* Eyebrow — cohort + verification tier + channel. Unchanged logic. */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <span className="uppercase font-bold" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.2em", color: "#585868" }}>
            Payments gap · {inputSnapshot?.country || "—"}
          </span>
          {channel === "in_store" && (
            <span
              title="Analysis based on in-store (physical terminal) payment rates."
              className="uppercase font-bold px-2 py-0.5 rounded-full"
              style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em", background: "rgba(168,85,247,0.12)", color: "rgb(216,180,254)", border: "1px solid rgba(168,85,247,0.35)" }}
            >
              In-store
            </span>
          )}
          {isMeasured ? (
            <span
              title="Measured from your real Stripe transaction data over the last 90 days."
              className="uppercase font-black px-2 py-0.5 rounded-full inline-flex items-center gap-1"
              style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em", background: "linear-gradient(135deg, rgba(34,211,238,0.22) 0%, rgba(59,130,246,0.18) 100%)", color: "rgb(103,232,249)", border: "1px solid rgba(34,211,238,0.55)", boxShadow: "0 0 12px rgba(34,211,238,0.25)" }}
            >
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Verified
            </span>
          ) : cohortVerifiedRow ? (
            <span
              title="Calculated against your PSP's publicly published pricing."
              className="uppercase font-bold px-2 py-0.5 rounded-full"
              style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em", background: "rgba(34,211,238,0.12)", color: "rgb(34,211,238)", border: "1px solid rgba(34,211,238,0.35)" }}
            >
              Public pricing
            </span>
          ) : (
            <span
              title="No public pricing available for this cohort — we used regional averages."
              className="uppercase font-bold px-2 py-0.5 rounded-full"
              style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.65)", border: "1px solid rgba(255,255,255,0.15)" }}
            >
              Regional estimate
            </span>
          )}
        </div>

        {/* PIEZA A — GAUGE + segmented CTA. */}
        {scoreAvailable ? (
          <div
            className="rounded-2xl p-5 mb-7 flex flex-col sm:flex-row sm:items-center gap-5"
            style={{
              background: `radial-gradient(120% 120% at 0% 0%, ${toneColors.soft} 0%, transparent 60%), rgba(255,255,255,0.02)`,
              border: `1px solid ${toneColors.ring}`,
              boxShadow: `0 0 28px -10px ${toneColors.glow}`,
            }}
          >
            <div className="flex items-center gap-5 flex-1 min-w-0">
              <ScoreGauge score={scoreResult.score} grade={scoreResult.grade} tone={tone} muted={scoreMuted} />
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="uppercase font-bold" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.18em", color: "rgba(255,255,255,0.5)" }}>
                    Payments efficiency
                  </span>
                  {scoreMuted && (
                    <span
                      className="uppercase font-bold px-1.5 py-0.5 rounded-full"
                      style={{ fontFamily: MONO, fontSize: 8, letterSpacing: "0.12em", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.15)" }}
                    >
                      Estimate
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-white/55 leading-snug">{scoreResult.contextLine}</p>
              </div>
            </div>
            <div
              className="sm:w-[38%] sm:border-l sm:pl-5 flex flex-col justify-center shrink-0"
              style={{ borderColor: "rgba(255,255,255,0.08)" }}
            >
              <ScoreRecoveryCTA
                grade={scoreResult.grade}
                tone={tone}
                toneColors={toneColors}
                isAnonymous={isAnonymous}
                onRecoveryClick={onScoreCTA}
              />
            </div>
          </div>
        ) : (
          <div
            className="rounded-2xl px-4 py-3 mb-7 flex items-center gap-3"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <span className="uppercase font-bold" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.18em", color: "rgba(255,255,255,0.4)" }}>Payments efficiency</span>
            <span className="text-[13px] text-white/55 inline-flex items-center gap-1.5">
              {achievableLocked && isAnonymous
                ? (<><Lock size={12} className="shrink-0" /> {t("locked_achievable_rate")}</>)
                : "Connect your PSP to score"}
            </span>
          </div>
        )}

        {/* PIEZA B — LIVE FIGURE. */}
        <p className="text-[13px] mb-2" style={{ color: "#9A9AAB" }}>You're overpaying by roughly</p>
        <div className="flex items-baseline gap-3 flex-wrap">
          <EuroCountUp
            value={isFinite(annual.point) ? annual.point : (annual.lo + annual.hi) / 2}
            className="font-black tabular-nums"
            style={{
              fontFamily: MONO,
              fontSize: "clamp(44px, 10vw, 82px)",
              letterSpacing: "-0.03em",
              lineHeight: 1,
              color: "#2FE0A8",
              textShadow: "0 0 12px rgba(47,224,168,0.22)",
            }}
          />
          <span className="text-[13px]" style={{ color: "#585868" }}>/ year</span>
        </div>
        <p className="text-[12px] mt-2.5" style={{ color: "#585868" }}>
          {isFinite(annual.lo) && isFinite(annual.hi) && (
            <>Range <span className="font-semibold tabular-nums" style={{ fontFamily: MONO, color: "#2FE0A8" }}>{eur(annual.lo)}–{eur(annual.hi)}</span> · </>
          )}
          about <span className="font-semibold tabular-nums" style={{ fontFamily: MONO, color: "#2FE0A8" }}>
            {isFinite(monthly.point) ? eur(monthly.point) : `${eur(monthly.lo)}–${eur(monthly.hi)}`}
          </span> a month
        </p>

        {/* Rate chip — mono, current(red) → achievable(cyan). */}
        {compact ? (
          <div
            className="mt-6 inline-flex items-center gap-2.5 flex-wrap rounded-xl px-4 py-3"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <span className="uppercase font-bold" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.15em", color: "#585868" }}>Effective rate</span>
            <span className="tabular-nums font-bold text-[15px] md:text-[16px]" style={{ fontFamily: MONO, color: "#F45B69" }}>
              {pctFromBps(current)} today
            </span>
            <span style={{ color: "#585868" }} aria-hidden="true">→</span>
            {achievableLocked ? (
              <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: "#7BD9F0" }}>
                <Lock size={12} className="shrink-0" /> {t("locked_achievable_rate")}
              </span>
            ) : (
              <>
                <span className="tabular-nums font-bold text-[15px] md:text-[16px]" style={{ fontFamily: MONO, color: "#7BD9F0" }}>
                  {pctFromBps(achievable)} achievable
                </span>
                {gapPct && <span className="text-[12px]" style={{ color: "#585868" }}>({gapPct} pts lower)</span>}
              </>
            )}
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-xl p-4" style={{ background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.20)" }}>
              <p className="uppercase font-bold mb-1" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.15em", color: "rgba(248,113,113,0.8)" }}>You pay today</p>
              <p className="tabular-nums font-black" style={{ fontFamily: MONO, fontSize: 26, letterSpacing: "-0.02em", color: "#F45B69", textShadow: "0 0 8px rgba(248,113,113,0.18)" }}>
                {pctFromBps(current)}
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: "#585868" }}>
                {isMeasured && txCount && daysCovered
                  ? <>Your rate, measured from {txCount} charges over {daysCovered} days</>
                  : <>effective, on {inputSnapshot?.provider_slug || "your PSP"}</>}
              </p>
            </div>
            <div className="rounded-xl p-4" style={{ background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.25)" }}>
              <p className="uppercase font-bold mb-1" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.15em", color: "rgba(103,232,249,0.9)" }}>You should pay</p>
              {achievableLocked ? (
                <div className="flex items-start gap-2 mt-1">
                  <Lock size={14} className="mt-0.5 shrink-0" style={{ color: "#7BD9F0" }} />
                  <p className="text-[12px] leading-snug font-semibold" style={{ color: "#7BD9F0" }}>
                    {t("locked_achievable_rate")}
                  </p>
                </div>
              ) : (
                <>
                  <p className="tabular-nums font-black" style={{ fontFamily: MONO, fontSize: 26, letterSpacing: "-0.02em", color: "#7BD9F0", textShadow: "0 0 8px rgba(34,211,238,0.18)" }}>
                    {pctFromBps(achievable)}
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: "#585868" }}>
                    {gapPct ? `${gapPct} pts below your current rate` : "achievable rate"}
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
// PaymentsScoreBadge — the CAMBRA payments-efficiency Score in the report hero.
//
// Credit-score framing (operator's UX call): the NUMBER (63/100) is primary,
// the letter grade (C) is secondary — reads as a metric, not a school report
// card. Both shown together.
//
// SINGLE SOURCE OF TRUTH: everything comes from computePaymentsScore(), which
// is a pure function of the two bps the engine already produced. This component
// renders — it never computes the score itself.
//
// FRAMING: the context line grades the merchant's cost efficiency and NEVER
// names the PSP. It's rendered verbatim from the helper — do not append a
// provider name here.
//
// CONFIDENCE: when `verified === false` (estimated), the number carries a "~"
// and an "Estimate" tag, and the whole badge is slightly muted — the Score is
// honest about being an estimate until the merchant connects their PSP.
//
// SEGMENTED CTA (right column):
//   grade C/D/F (room to recover) → action toward CAMBRA's recovery roadmap.
//     anonymous → "Desbloquea tu plan →"  ·  registered → "Ver cómo lo recuperamos →"
//   grade A/B (already at the floor) → "Eres top-tier · monitoriza tu drift" + ✓,
//     NO "improve" language, passive (no click destination).
//   The action ALWAYS routes to the roadmap (which only offers CAMBRA actions).
//   This component NEVER links to an external PSP.

import { useState } from "react";
import { Info, ArrowRight, ShieldCheck } from "lucide-react";
import { computePaymentsScore } from "@/lib/paymentsScore.js";
import { useTranslation } from "@/lib/i18n.jsx";

// Tone token → concrete colors (maps to the semantic --score-* tokens in
// src/index.css, kept as rgb here so the badge can tint borders/glows/gradients
// beyond what a single utility class allows).
const TONE = {
  excellent: { text: "rgb(45,212,191)",  ring: "rgba(45,212,191,0.45)",  glow: "rgba(45,212,191,0.22)",  soft: "rgba(45,212,191,0.10)" },
  good:      { text: "rgb(96,165,250)",  ring: "rgba(96,165,250,0.45)",  glow: "rgba(96,165,250,0.22)",  soft: "rgba(96,165,250,0.10)" },
  medium:    { text: "rgb(251,191,36)",  ring: "rgba(251,191,36,0.45)",  glow: "rgba(251,191,36,0.20)",  soft: "rgba(251,191,36,0.10)" },
  risk:      { text: "rgb(248,113,113)", ring: "rgba(248,113,113,0.45)", glow: "rgba(248,113,113,0.20)", soft: "rgba(248,113,113,0.10)" },
};

export default function PaymentsScoreBadge({
  engineResult,
  className = "",
  isAnonymous = false,
  onRecoveryClick,
}) {
  const [showHow, setShowHow] = useState(false);
  const { t } = useTranslation();
  const result = computePaymentsScore(engineResult);

  // Honest neutral state — never fabricate a grade when we can't score.
  if (!result.available) {
    return (
      <div
        className={`rounded-2xl px-4 py-3 flex items-center gap-3 ${className}`}
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-white/40">Payments efficiency</span>
          <span className="text-[13px] text-white/55">Connect your PSP to score</span>
        </div>
      </div>
    );
  }

  const { score, grade, tone, contextLine, verified } = result;
  const c = TONE[tone] || TONE.medium;
  const muted = !verified;
  // A/B = at the floor (top-tier). C/D/F = room to recover.
  const isTopTier = grade === "A" || grade === "B";

  return (
    <div
      className={`relative rounded-2xl px-5 py-4 ${className}`}
      style={{
        background: `radial-gradient(120% 120% at 0% 0%, ${c.soft} 0%, transparent 60%), rgba(255,255,255,0.03)`,
        border: `1px solid ${c.ring}`,
        boxShadow: `0 0 28px -8px ${c.glow}`,
        opacity: muted ? 0.9 : 1,
      }}
    >
      {/* Two columns: LEFT = score number/letter/line, RIGHT = segmented CTA.
          Stacks on mobile, side-by-side on sm+. */}
      <div className="flex flex-col sm:flex-row sm:items-stretch gap-4">
        {/* LEFT — the score itself (unchanged content). */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-white/50">
              Payments efficiency
            </span>
            <div className="flex items-center gap-1.5">
              {muted && (
                <span
                  className="text-[8px] uppercase tracking-[0.14em] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.15)" }}
                >
                  Estimate
                </span>
              )}
              <button
                type="button"
                onClick={() => setShowHow((v) => !v)}
                className="text-white/40 hover:text-white/80 transition-colors"
                aria-label="How this score is calculated"
              >
                <Info size={13} />
              </button>
            </div>
          </div>

          {/* Primary = number (credit-score framing), secondary = letter grade. */}
          <div className="flex items-baseline gap-2.5">
            <span
              className="font-black tabular-nums leading-none"
              style={{
                fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                fontSize: "clamp(34px, 7vw, 46px)",
                letterSpacing: "-0.04em",
                color: c.text,
              }}
            >
              {muted && <span className="opacity-70">~</span>}{score}
            </span>
            <span className="text-[15px] font-bold text-white/40 tabular-nums">/ 100</span>
            <span
              className="ml-1 inline-flex items-center justify-center h-7 min-w-7 px-2 rounded-lg font-black text-[16px]"
              style={{ background: c.soft, color: c.text, border: `1px solid ${c.ring}` }}
            >
              {grade}
            </span>
          </div>

          <p className="text-[12px] text-white/55 mt-2 leading-snug">{contextLine}</p>

          {showHow && (
            <div
              className="mt-3 rounded-xl px-3 py-2.5 text-[11px] leading-relaxed text-white/60"
              style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              Your score reflects how close what you pay is to the best
                          rate possible for your profile. Being at that floor scores
              highest; paying near the top of the market scores lowest. It grades
              your cost setup — not any specific provider.
              {muted && " This is an estimate until you connect your PSP for exact figures."}
            </div>
          )}
        </div>

        {/* RIGHT — segmented CTA. */}
        <div
          className="sm:w-[42%] sm:border-l sm:pl-4 flex flex-col justify-center"
          style={{ borderColor: "rgba(255,255,255,0.08)" }}
        >
          {isTopTier ? (
            // A/B — top-tier. Passive celebratory state, NO "improve" language.
            <div className="flex flex-col gap-2">
              <div className="inline-flex items-center gap-1.5">
                <ShieldCheck size={15} style={{ color: c.text }} />
                <span className="text-[13px] font-bold" style={{ color: c.text }}>
                  {t("roadmap_toptier_title")}
                </span>
              </div>
              <p className="text-[12px] text-white/55 leading-snug">
                {t("roadmap_toptier_body")}
              </p>
            </div>
          ) : (
            // C/D/F — room to recover. Action routes to the CAMBRA roadmap.
            <button
              type="button"
              onClick={onRecoveryClick}
              className="group w-full h-full min-h-[64px] rounded-xl px-4 py-3 flex items-center justify-between gap-2 text-left transition-all hover:brightness-110"
              style={{
                background: `linear-gradient(135deg, ${c.soft} 0%, rgba(255,255,255,0.02) 100%)`,
                border: `1px solid ${c.ring}`,
              }}
            >
              <span className="text-[13px] font-bold leading-snug" style={{ color: c.text }}>
                {isAnonymous ? t("score_cta_unlock") : t("score_cta_recover")}
              </span>
              <ArrowRight
                size={16}
                style={{ color: c.text }}
                className="shrink-0 transition-transform group-hover:translate-x-0.5"
              />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
// DashboardHeroV2 — Dashboard v2, Phase 1 (hero + gauge).
//
// SINGLE SOURCE OF TRUTH: the figure here is the SAME number the /Results
// report shows. It reads `latest.details.engine_result` (the payments-gap
// engine output) — identical to PaymentsGapCard — and derives the Score from
// the SAME computePaymentsScore(). No second engine, nothing recomputed.
//
// Honest fallback: legacy AnalyzerResult rows produced before the payments
// pivot have no engine_result. For those we fall back to total_savings +
// details.savings_range (the values the old hero already showed) so the card
// never renders blank — but the gauge/rate chip only appear when engine_result
// exists (we never fabricate bps).
//
// Verification badge inherits the row's verification_status:
//   verified              → emerald "Verified"
//   pending_verification  → blue    "Provisional"
//   estimated (default)   → amber   "Estimated · connect Stripe to sharpen"
//
// CTAs:
//   "Connect Stripe to verify" → /ConnectTools (hidden once verified)
//   "Start recovery"           → onStartRecovery() (opens collective/call modal)
//
// Payments only. No external PSP names. No over-promised rates.

import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck, Plug, CheckCircle2 } from "lucide-react";
import { computePaymentsScore } from "@/lib/paymentsScore.js";
import ScoreGauge from "@/components/paymentsResults/ScoreGauge";
import EuroCountUp from "@/components/paymentsResults/EuroCountUp";

const MONO = "'IBM Plex Mono', ui-monospace, monospace";

function eur(n) {
  if (!isFinite(n)) return "—";
  return "€" + Math.round(n).toLocaleString("en-US");
}
function pctFromBps(bps) {
  if (!isFinite(bps)) return "—";
  return (bps / 100).toFixed(2) + "%";
}

export default function DashboardHeroV2({ latest, stripeConnected = false, onStartRecovery }) {
  const engineResult = latest?.details?.engine_result || null;
  const verificationStatus = latest?.verification_status || "estimated";
  const isVerified = verificationStatus === "verified";
  const isProvisional = verificationStatus === "pending_verification";

  // THE FIGURE — same source as the report. Prefer engine_result's annual
  // savings point (verbatim), fall back to legacy total_savings for old rows.
  const annual = engineResult?.annual_savings_eur || {};
  const point = isFinite(annual.point)
    ? annual.point
    : (isFinite(annual.lo) && isFinite(annual.hi) ? (annual.lo + annual.hi) / 2 : Number(latest?.total_savings));
  const rangeLo = isFinite(annual.lo) ? annual.lo : latest?.details?.savings_range?.lo;
  const rangeHi = isFinite(annual.hi) ? annual.hi : latest?.details?.savings_range?.hi;

  const current = engineResult?.current_effective_bps;
  const achievable = engineResult?.achievable_effective_bps;
  const gapPct = isFinite(current) && isFinite(achievable) ? ((current - achievable) / 100).toFixed(2) : null;

  // Score (same helper as the report) → gauge.
  const scoreResult = computePaymentsScore(engineResult);
  const scoreAvailable = scoreResult.available;
  const scoreMuted = scoreAvailable && !scoreResult.verified;

  // Verification badge.
  const badge = isVerified
    ? { label: "Verified", cls: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300", dot: "bg-emerald-400", icon: CheckCircle2 }
    : isProvisional
      ? { label: "Provisional", cls: "border-blue-400/30 bg-blue-400/10 text-blue-300", dot: "bg-blue-400", icon: ShieldCheck }
      : { label: "Estimated", cls: "border-amber-400/30 bg-amber-400/10 text-amber-300", dot: "bg-amber-400", icon: ShieldCheck };

  return (
    <div
      className="relative rounded-3xl p-6 md:p-8 overflow-hidden"
      style={{
        background: "#070c16",
        border: "1px solid rgba(255,255,255,0.09)",
        boxShadow: "0 24px 64px -28px rgba(0,0,0,0.7)",
      }}
    >
      {/* Tech grid overlay — radial mask fades to edges. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(#0d1a30 1px, transparent 1px), linear-gradient(90deg, #0d1a30 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          opacity: 0.6,
          maskImage: "radial-gradient(ellipse 95% 85% at 50% 20%, #000 30%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 95% 85% at 50% 20%, #000 30%, transparent 100%)",
        }}
      />
      {/* Ambient cyan halo */}
      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          width: 460, height: 460, right: "-12%", top: "-32%",
          background: "radial-gradient(circle, rgba(34,211,238,0.16) 0%, transparent 70%)",
          filter: "blur(70px)",
        }}
      />

      <div className="relative z-10 flex flex-col lg:flex-row lg:items-center gap-7 lg:gap-9">
        {/* LEFT — figure + badge + CTAs */}
        <div className="flex-1 min-w-0">
          <div className={`inline-flex items-center gap-1.5 mb-4 px-2.5 py-1 rounded-full border text-[10px] uppercase tracking-[0.18em] font-bold ${badge.cls}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
            {badge.label}
          </div>

          <p className="uppercase font-bold mb-2.5" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.22em", color: "#5f6f88" }}>
            Identified potential
          </p>

          <div className="flex items-baseline gap-3 flex-wrap">
            <EuroCountUp
              value={point}
              className="font-black tabular-nums"
              style={{
                fontFamily: MONO,
                fontSize: "clamp(44px, 9vw, 78px)",
                letterSpacing: "-0.03em",
                lineHeight: 1,
                color: "#22d3ee",
                textShadow: "0 0 14px rgba(34,211,238,0.20)",
              }}
            />
            <span className="text-[13px]" style={{ color: "#5f6f88" }}>/ year</span>
          </div>

          {isFinite(rangeLo) && isFinite(rangeHi) && (
            <p className="text-[12px] mt-2.5" style={{ color: "#5f6f88" }}>
              Confidence band{" "}
              <span className="font-semibold tabular-nums" style={{ fontFamily: MONO, color: "#8a97ad" }}>
                {eur(rangeLo)}–{eur(rangeHi)}
              </span>{" "}/ year
            </p>
          )}

          {!isVerified && (
            <p className="text-[12px] mt-1.5" style={{ color: "#6b7a92" }}>
              Connect Stripe to sharpen this figure from your real transactions.
            </p>
          )}

          {/* Rate chip — only when engine_result carries bps (never fabricated). */}
          {gapPct && (
            <div
              className="mt-5 inline-flex items-center gap-2.5 flex-wrap rounded-xl px-4 py-2.5"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <span className="uppercase font-bold" style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.15em", color: "#5f6f88" }}>Effective rate</span>
              <span className="tabular-nums font-bold text-[14px]" style={{ fontFamily: MONO, color: "#f87171" }}>
                {pctFromBps(current)} today
              </span>
              <span style={{ color: "#5f6f88" }} aria-hidden="true">→</span>
              <span className="tabular-nums font-bold text-[14px]" style={{ fontFamily: MONO, color: "#67e8f9" }}>
                {pctFromBps(achievable)} achievable
              </span>
            </div>
          )}

          {/* CTAs */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onStartRecovery}
              className="inline-flex items-center justify-center h-11 rounded-full px-6 text-sm font-bold gap-2 text-white hover:opacity-90 transition-opacity"
              style={{
                background: "linear-gradient(135deg, #1F4ED8 0%, #2CA7C1 100%)",
                boxShadow: "0 0 32px rgba(34,211,238,0.35), 0 12px 32px -12px rgba(34,211,238,0.5)",
              }}
            >
              Start recovery <ArrowRight className="h-4 w-4" />
            </button>
            {!isVerified && (
              <Link
                to="/ConnectTools"
                className="inline-flex items-center justify-center h-11 rounded-full px-5 text-sm font-bold gap-2 text-white/85 hover:text-white transition-colors"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.14)" }}
              >
                <Plug size={14} /> {stripeConnected ? "Verify with Stripe" : "Connect Stripe to verify"}
              </Link>
            )}
          </div>
        </div>

        {/* RIGHT — efficiency gauge */}
        <div className="shrink-0 flex flex-col items-center gap-3">
          {scoreAvailable ? (
            <>
              <ScoreGauge score={scoreResult.score} grade={scoreResult.grade} tone={scoreResult.tone} muted={scoreMuted} size={150} />
              <div className="text-center max-w-[190px]">
                <p className="uppercase font-bold" style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.18em", color: "rgba(255,255,255,0.45)" }}>
                  Payments efficiency
                </p>
                <p className="text-[11px] text-white/55 mt-1 leading-snug">{scoreResult.contextLine}</p>
              </div>
            </>
          ) : (
            <div
              className="rounded-2xl px-5 py-6 text-center max-w-[190px]"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <p className="uppercase font-bold mb-1.5" style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.18em", color: "rgba(255,255,255,0.4)" }}>
                Payments efficiency
              </p>
              <p className="text-[12px] text-white/55">Connect your PSP to score your setup.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
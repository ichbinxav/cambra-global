// AssumptionsFootnote — assumptions + provenance shown next to the gap card.
//
// #2 FIX (2026-07-12) — placement per gate.
// The engine emits a lot of methodology (fixed-fee amortization, achievable
// anchor breakdown, ± bands, savings-range clarifier, engine + cohort metadata).
// That level of detail belongs in the FULL / VERIFIED report — not in the
// anonymous teaser, where the user hasn't signed up yet and where too much
// small print buries the actual gap number they came for.
//
// Behavior:
//   • Teaser mode (engine_result.mode === "estimated", anonymous audit):
//     render ONLY the "regional estimate" disclaimer when the cohort is a
//     fallback row (verified=false) — that's a warning the user MUST see,
//     not an assumption. Everything else (assumption list, ± clarifier,
//     engine+cohort metadata) hides behind the sign-up gate.
//   • Verified / signed-in mode (engine_result.mode === "verified"):
//     render the full detail — the user is committed and wants the audit
//     trail.
//
// Zero business-logic change. The engine still emits the full assumptions
// array on both paths — we just don't render the deep detail in the teaser.
// FeeBreakdownCard parses these assumptions independently and is untouched.

import { Info, AlertCircle, Lock } from "lucide-react";

export default function AssumptionsFootnote({ engineResult, engineVersion }) {
  const assumptions = engineResult?.assumptions || [];
  const verified = engineResult?.cohort?.verified === true;
  const cohortKey = engineResult?.cohort?.key;
  const matched = engineResult?.cohort?.matched;
  // #2 — mode gate. "verified" = signed-in real-Stripe path (full detail).
  // Anything else (estimated teaser, combined estimated, …) = teaser view.
  const isVerifiedMode = engineResult?.mode === "verified";
  // M4-TPV Fase 3 — the "connect your PSP" fallback disclaimer is online-only
  // advice. For an in-store session an equivalent action is "upload a TPV
  // provider statement". We branch the CTA line based on cohort.channel so
  // the disclaimer never advises an action the user can't take.
  const channel = engineResult?.cohort?.channel;
  const isInStore = channel === "in_store";
  // Derive the savings-range half-width shown in the hero card, purely for
  // the "two ± are different things" clarifier line rendered under the
  // assumptions list. Both endpoints (mensual/annual) apply the same
  // symmetric band around the point, so hi/point − 1 is the fraction.
  // Falls back to null (line hidden) when the point is 0 or missing —
  // there's no range to explain in that case.
  const point = engineResult?.monthly_savings_eur?.point;
  const hi = engineResult?.monthly_savings_eur?.hi;
  const bandPct = (typeof point === 'number' && point > 0 && typeof hi === 'number')
    ? Math.round(((hi / point) - 1) * 100)
    : null;

  return (
    <div className="space-y-4">
      {/* Fallback disclaimer — prominent, not fine print */}
      {!verified && (
        <div
          className="rounded-xl p-4 flex items-start gap-3"
          style={{ background: "rgba(251,146,60,0.06)", border: "1px solid rgba(251,146,60,0.30)" }}
        >
          <AlertCircle size={16} className="text-orange-300 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-orange-200">Estimate based on regional averages</p>
            <p className="text-[12px] text-orange-100/85 mt-0.5">
              {isInStore
                ? "We don't have verified public pricing for this TPV provider in your region yet. Upload a provider statement for exact figures."
                : "We don't have verified public pricing for this PSP in your region yet. Connect your PSP for exact figures."}
            </p>
          </div>
        </div>
      )}

      {/* Full-detail block — VERIFIED / signed-in only.
          In the anonymous teaser this whole panel collapses to a single
          "locked" line (rendered below). That keeps the teaser focused on
          the gap number + the fallback-row warning (if any), and moves the
          audit trail behind the sign-up gate where it belongs. */}
      {isVerifiedMode ? (
        <div
          className="rounded-xl p-5"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Info size={13} className="text-white/50" />
            <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-white/55">
              Assumptions
            </p>
          </div>
          {assumptions.length === 0 ? (
            <p className="text-[12px] text-white/40">No assumptions recorded.</p>
          ) : (
            <ul className="space-y-2">
              {assumptions.map((a, i) => (
                <li key={i} className="text-[12px] text-white/65 leading-relaxed pl-3 border-l border-white/10">
                  {a}
                </li>
              ))}
            </ul>
          )}

          {/* Two-bands clarifier — the savings range around the point (this
              card, ±{bandPct}% relative, editorial per cohort) is a DIFFERENT
              quantity from the ±N bps that appears inside the processor-margin
              assumption above. Rendering this as a contextual line (not another
              bullet) keeps it from being read as one more assumption to skim
              past — it's meta-context about the numbers themselves. */}
          {bandPct !== null && (
            <p className="mt-3 pt-3 text-[11px] text-white/45 leading-relaxed border-t border-white/8">
              The savings range shown above is ±{bandPct}% around the point — our overall confidence in the achievable benchmark for this cohort. That is a different quantity from any "±N bps" mentioned inside an individual assumption, which measures uncertainty on a single component (e.g. processor margin), not on the total.
            </p>
          )}

          {/* Engine + cohort metadata — tiny, monospace, honest */}
          <div className="mt-4 pt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-white/35 border-t border-white/8">
            {engineVersion && (
              <span>engine <span className="font-mono">{engineVersion}</span></span>
            )}
            {cohortKey && (
              <span>cohort <span className="font-mono">{cohortKey}</span></span>
            )}
            {matched && (
              <span>match <span className="font-mono">{matched}</span></span>
            )}
          </div>
        </div>
      ) : (
        // Teaser view — one honest, gated line. The user knows there's more,
        // and where to get it, without being buried in methodology before
        // they've decided to sign up.
        <div
          className="rounded-xl p-4 flex items-center gap-3"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <Lock size={13} className="text-white/40 shrink-0" />
          <p className="text-[12px] text-white/55 leading-relaxed">
            Full audit trail — how we amortized the fixed fee, which anchor we compared against, and the confidence bands — appears in your report after you create a free account.
          </p>
        </div>
      )}
    </div>
  );
}
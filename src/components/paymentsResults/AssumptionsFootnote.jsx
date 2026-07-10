// AssumptionsFootnote — always-visible list of the assumptions the engine
// applied. Not hidden in a modal, not in small print — the user has to see
// how we got to the number for the number to be trustworthy.
//
// Also renders the "regional estimate" disclaimer prominently when the
// cohort was a fallback row (verified: false).

import { Info, AlertCircle } from "lucide-react";

export default function AssumptionsFootnote({ engineResult, engineVersion }) {
  const assumptions = engineResult?.assumptions || [];
  const verified = engineResult?.cohort?.verified === true;
  const cohortKey = engineResult?.cohort?.key;
  const matched = engineResult?.cohort?.matched;
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
              We don't have verified public pricing for this PSP in your region yet. Connect your PSP for exact figures.
            </p>
          </div>
        </div>
      )}

      {/* Assumptions list */}
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
    </div>
  );
}
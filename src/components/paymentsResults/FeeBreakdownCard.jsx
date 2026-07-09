// FeeBreakdownCard — shows the achievable rate's composition transparently.
//
// The achievable_breakdown_json field on the rate table row is the whole
// point of this card: we're not asking the user to trust a magic number,
// we're showing exactly what interchange + scheme + margin the achievable
// figure is built from. The "processor margin" line is explicitly flagged
// as the negotiable component — that's the value CAMBRA unlocks.
//
// Fallback: if the engine's assumptions[] doesn't include the breakdown
// string (e.g. cohort was a regional fallback with no breakdown attached),
// we render a simpler, quieter version rather than dropping the card.

import { Sparkles } from "lucide-react";

// Try to parse "interchange N bps + scheme fees N bps + assumed processor
// margin N bps (±N bps assumption)" out of the assumption line the engine
// emits. This is the same string ACHIEVABLE_NOTE() writes in the SYNC block —
// parsing it here avoids adding a new field to the API contract just for UI.
function parseAchievableBreakdown(assumptions) {
  const line = (assumptions || []).find((a) => typeof a === "string" && a.startsWith("Achievable rate composition:"));
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

function Bar({ label, bps, color, note, negotiable }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] font-semibold text-white/85">{label}</span>
          {negotiable && (
            <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.14em] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: "rgba(34,211,238,0.14)", color: "rgb(34,211,238)", border: "1px solid rgba(34,211,238,0.35)" }}
            >
              <Sparkles size={9} /> Negotiable
            </span>
          )}
        </div>
        <span className="tabular-nums text-white/75 text-[12px] font-semibold">{bps.toFixed(0)} bps</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (bps / 200) * 100)}%`, background: color }} />
      </div>
      {note && <p className="text-[10px] text-white/40">{note}</p>}
    </div>
  );
}

export default function FeeBreakdownCard({ engineResult }) {
  const breakdown = parseAchievableBreakdown(engineResult?.assumptions);

  return (
    <div
      className="rounded-2xl p-5 md:p-6"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-white/55 mb-1">
        Where your fee comes from
      </p>
      <p className="text-[12px] text-white/45 mb-5">
        Interchange and scheme fees are hard floors set by Visa/Mastercard and issuing banks. The processor margin is what your PSP charges on top — that's the piece you can move.
      </p>

      {breakdown ? (
        <div className="space-y-4">
          <Bar
            label="Interchange"
            bps={breakdown.interchange_bps}
            color="rgba(255,255,255,0.55)"
            note="Regulated floor (EU IFR 2015/751 / regional equivalents)"
          />
          <Bar
            label="Scheme fees"
            bps={breakdown.scheme_fees_bps}
            color="rgba(255,255,255,0.4)"
            note="Card network (Visa / Mastercard) — non-negotiable"
          />
          <Bar
            label="Processor margin"
            bps={breakdown.processor_margin_bps}
            color="linear-gradient(90deg, #22d3ee 0%, #3b82f6 100%)"
            note={`Assumed ±${breakdown.processor_margin_band_bps} bps — this is where the savings live`}
            negotiable
          />
        </div>
      ) : (
        <p className="text-[12px] text-white/60">
          For this cohort we don't have a public breakdown of the achievable rate. The savings figure above is derived from regional benchmarks — connect your PSP for a precise decomposition.
        </p>
      )}
    </div>
  );
}
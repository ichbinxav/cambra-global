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

import { Sparkles, Lock } from "lucide-react";

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

export default function FeeBreakdownCard({ engineResult, locked = false }) {
  const breakdown = parseAchievableBreakdown(engineResult?.assumptions);
  // Channel-aware fallback (M4-TPV Fase 3). ACHIEVABLE_NOTE has two shapes:
  //   - Online: "interchange N + scheme N + margin N (±N bps assumption)"
  //     → parser above matches, breakdown renders normally.
  //   - In-store: "Achievable rate anchored to the best publicly contractable
  //     card-present provider…" → parser returns null. We used to fall back
  //     to "connect your PSP for a precise decomposition", which is
  //     online-only advice (in-store merchants upload TPV invoices, not
  //     connect a PSP). Now we surface the anchor line verbatim from
  //     assumptions[] instead — auditable, coherent with the in-store
  //     product's honest "no theoretical breakdown, anchored to a real
  //     provider" positioning.
  const channel = engineResult?.cohort?.channel;
  const isInStore = channel === "in_store";
  // COHERENCE-1 (2026-07-24) — engine 1.5/1.6 emits "Achievable anchored to…"
  // (multi-anchor copy) while older sessions carry "Achievable rate anchored
  // to…". Match both so the anchor panel renders for every in-store session.
  const anchorLine = isInStore
    ? (engineResult?.assumptions || []).find(
        (a) => typeof a === "string" && /^Achievable (rate )?anchored to/.test(a)
      )
    : null;

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
        {isInStore
          ? "In-store card-present pricing is usually published as a single blended rate — there's no auditable interchange/scheme split. Instead of inventing one, we anchor the achievable rate to a specific provider you can contract today."
          : "Interchange and scheme fees are hard floors set by Visa/Mastercard and issuing banks. The processor margin is what your PSP charges on top — that's the piece you can move."}
      </p>

      {breakdown ? (
        <div className="relative">
          {/* Locked mode (anonymous teaser): show the SHAPE of the breakdown
              (labels, bars, negotiable pill) but blur the numeric values and
              stack a padlock overlay. The audit trail — exact bps, band,
              regulatory citations — is one of the biggest reasons users
              create an account, so we tease it without giving it away. */}
          <div
            className={`space-y-4 transition-all ${locked ? "select-none pointer-events-none" : ""}`}
            style={locked ? { filter: "blur(5px)", opacity: 0.55 } : undefined}
            aria-hidden={locked || undefined}
          >
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
              color="linear-gradient(90deg, #39C6F0 0%, var(--voltio) 100%)"
              note={`Assumed ±${breakdown.processor_margin_band_bps} bps — this is where the savings live`}
              negotiable
            />
          </div>
          {locked && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
              <div
                className="inline-flex items-center justify-center h-10 w-10 rounded-full mb-2"
                style={{
                  background: "rgba(34,211,238,0.14)",
                  border: "1px solid rgba(34,211,238,0.45)",
                  boxShadow: "0 0 20px rgba(34,211,238,0.3)",
                }}
              >
                <Lock size={16} className="text-cyan-300" />
              </div>
              <p className="text-white text-[13px] font-bold mb-0.5">
                Full breakdown in your report
              </p>
              <p className="text-[11px] text-white/55 max-w-[240px]">
                Create a free account to see exact interchange, scheme &amp; margin bps.
              </p>
            </div>
          )}
        </div>
      ) : isInStore && anchorLine ? (
        <div
          className="rounded-xl p-4"
          style={{
            background: "rgba(34,211,238,0.05)",
            border: "1px solid rgba(34,211,238,0.20)",
          }}
        >
          <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-cyan-300/80 mb-2">
            Achievable rate anchor
          </p>
          <p className="text-[12.5px] text-white/75 leading-relaxed">
            {anchorLine}
          </p>
        </div>
      ) : isInStore ? (
        <p className="text-[12px] text-white/60">
          For in-store card payments we anchor the achievable rate to the best publicly contractable provider in your region. Upload a TPV provider statement for a precise measured rate.
        </p>
      ) : (
        <p className="text-[12px] text-white/60">
          For this cohort we don't have a public breakdown of the achievable rate. The savings figure above is derived from regional benchmarks — connect your PSP for a precise decomposition.
        </p>
      )}
    </div>
  );
}
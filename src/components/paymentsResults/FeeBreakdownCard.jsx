// FeeBreakdownCard — shows the composition of the rate you could pay.
//
// The achievable_breakdown_json field on the rate table row is the whole
// point of this card: we're not asking the user to trust a magic number,
// we're showing exactly which parts the figure is built from. The
// provider-margin line is explicitly flagged as the negotiable component —
// that's the value CAMBRA unlocks.
//
// COPY-2A (2026-07-31): copy moved to i18n (was hardcoded English) and
// rewritten in plain language. Bars now render percentages, never bps —
// basis points are an industry unit a shop owner does not read. The parsing,
// the numbers and the thresholds are untouched: only formatting and wording.
//
// Fallback: if the engine's assumptions[] doesn't include the breakdown
// string (e.g. a regional fallback row with no breakdown attached), we
// render a simpler, quieter version rather than dropping the card.

import { Sparkles, Lock } from "lucide-react";
import { useTranslation } from "@/lib/i18n.jsx";

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

// Display helper only — same value, merchant-readable unit.
const asPct = (bps) => `${(bps / 100).toFixed(2)}%`;

function Bar({ label, bps, color, note, negotiable, negotiableLabel }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] font-semibold text-white/85">{label}</span>
          {negotiable && (
            <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.14em] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: "rgba(34,211,238,0.14)", color: "rgb(34,211,238)", border: "1px solid rgba(34,211,238,0.35)" }}
            >
              <Sparkles size={9} /> {negotiableLabel}
            </span>
          )}
        </div>
        <span className="tabular-nums text-white/75 text-[12px] font-semibold">{asPct(bps)}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (bps / 200) * 100)}%`, background: color }} />
      </div>
      {note && <p className="text-[10px] text-white/40">{note}</p>}
    </div>
  );
}

export default function FeeBreakdownCard({ engineResult, locked = false }) {
  const { t } = useTranslation();
  const breakdown = parseAchievableBreakdown(engineResult?.assumptions);
  // Channel-aware fallback (M4-TPV Fase 3). ACHIEVABLE_NOTE has two shapes:
  //   - Online: "interchange N + scheme N + margin N (±N bps assumption)"
  //     → parser above matches, breakdown renders normally.
  //   - In-store: "Achievable rate anchored to the best publicly contractable
  //     card-present provider…" → parser returns null. We surface the anchor
  //     line verbatim from assumptions[] instead — auditable, coherent with
  //     the in-store product's honest "no theoretical breakdown, anchored to
  //     a real provider" positioning.
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
        {t("fee_title")}
      </p>
      <p className="text-[12px] text-white/45 mb-5">
        {isInStore ? t("fee_intro_instore") : t("fee_intro_online")}
      </p>

      {breakdown ? (
        <div className="relative">
          {/* Locked mode (anonymous teaser): show the SHAPE of the breakdown
              (labels, bars, negotiable pill) but blur the numeric values and
              stack a padlock overlay. The audit trail is one of the biggest
              reasons users create an account, so we tease it without giving
              it away. */}
          <div
            className={`space-y-4 transition-all ${locked ? "select-none pointer-events-none" : ""}`}
            style={locked ? { filter: "blur(5px)", opacity: 0.55 } : undefined}
            aria-hidden={locked || undefined}
          >
            <Bar
              label={t("fee_bar_interchange")}
              bps={breakdown.interchange_bps}
              color="rgba(255,255,255,0.55)"
              note={t("fee_bar_interchange_note")}
            />
            <Bar
              label={t("fee_bar_scheme")}
              bps={breakdown.scheme_fees_bps}
              color="rgba(255,255,255,0.4)"
              note={t("fee_bar_scheme_note")}
            />
            <Bar
              label={t("fee_bar_margin")}
              bps={breakdown.processor_margin_bps}
              color="linear-gradient(90deg, #39C6F0 0%, var(--voltio) 100%)"
              note={t("fee_bar_margin_note", { band: (breakdown.processor_margin_band_bps / 100).toFixed(2) })}
              negotiable
              negotiableLabel={t("fee_negotiable")}
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
                {t("fee_locked_title")}
              </p>
              <p className="text-[11px] text-white/55 max-w-[240px]">
                {t("fee_locked_sub")}
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
            {t("fee_anchor_title")}
          </p>
          <p className="text-[12.5px] text-white/75 leading-relaxed">
            {anchorLine}
          </p>
        </div>
      ) : isInStore ? (
        <p className="text-[12px] text-white/60">{t("fee_instore_fallback")}</p>
      ) : (
        <p className="text-[12px] text-white/60">{t("fee_nobreakdown")}</p>
      )}
    </div>
  );
}
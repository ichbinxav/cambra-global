// RecoveryRoadmap — the "how do I get the money back" panel.
//
// Renders the output of buildRecoveryRoadmap (src/lib/paymentsRoadmap.js).
// Single-source-of-truth presentation, sealed with the operator 2026-07-14:
//
//   • ONE recoverable figure at the top (recoverable_annual = the hero pool).
//     Shown ONCE. Recommendations are ROUTES (the HOW) — they carry NO € of
//     their own, so nothing on screen can be summed or contradict the hero.
//   • Ambition line (ambition_bps) = neutral upside copy ("brands in your tier
//     reach ~X% — where the collective pushes"), no € attached, no PSP name.
//   • Every route CTA points to a CAMBRA offer (managed migration / collective
//     / call / connect-to-verify) — never an external PSP. Enforced by mapping
//     cta_intent → CAMBRA-only labels+actions here.
//
// GATING:
//   anonymous  → recoverable figure + ambition + FIRST route visible, the rest
//                behind a locked overlay → "Crea tu cuenta para tu plan".
//   registered → all routes visible.
//
// STATES:
//   already_optimized → no routes; "Eres top-tier · monitoriza tu drift" badge.
//   insufficient_data → render nothing (parent decides; we return null).

import { ShieldCheck, ArrowRight, Lock, TrendingDown, Handshake, PhoneCall, Plug } from "lucide-react";
import { useTranslation } from "@/lib/i18n.jsx";

function eur(n) {
  if (!isFinite(n)) return "—";
  return "€" + Math.round(n).toLocaleString("en-US");
}

// cta_intent → CAMBRA-only presentation. Icon + i18n KEY for the button copy
// that leads to CAMBRA's offer. NEVER a third-party destination.
const INTENT = {
  managed_migration: { icon: Handshake,    ctaKey: "route_cta_migration" },
  collective:        { icon: TrendingDown, ctaKey: "route_cta_collective" },
  call:              { icon: PhoneCall,     ctaKey: "route_cta_call" },
  connect_verify:    { icon: Plug,          ctaKey: "route_cta_verify" },
};

const CONFIDENCE_KEY = { high: "meta_conf_high", medium: "meta_conf_med", low: "meta_conf_low" };
const EFFORT_KEY = { low: "meta_effort_low", medium: "meta_effort_med", high: "meta_effort_high" };
const PRIORITY_KEY = { high: "meta_prio_high", medium: "meta_prio_med", low: "meta_prio_med" };

function RouteRow({ rec, locked = false, onAction }) {
  const { t } = useTranslation();
  const meta = INTENT[rec.cta_intent] || INTENT.managed_migration;
  const Icon = meta.icon;
  return (
    <div
      className="relative rounded-xl p-4"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div className="flex items-start gap-3">
        <div
          className="shrink-0 inline-flex items-center justify-center h-9 w-9 rounded-lg"
          style={{ background: "rgba(34,211,238,0.10)", border: "1px solid rgba(34,211,238,0.25)" }}
        >
          <Icon size={16} className="text-cyan-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-[14px] leading-snug">{rec.title_key ? t(rec.title_key) : rec.title}</p>
          <p className="text-[12px] text-white/50 mt-0.5">
            {t(EFFORT_KEY[rec.effort] || "meta_effort_med")} · {t(CONFIDENCE_KEY[rec.confidence] || "meta_conf_med")} · {t(PRIORITY_KEY[rec.priority] || "meta_prio_med")}
          </p>
          {(rec.caveat_key || rec.caveat) && (
            <p className="text-[11px] text-amber-300/80 mt-1.5 leading-snug">{rec.caveat_key ? t(rec.caveat_key) : rec.caveat}</p>
          )}
          {!locked && (
            <button
              type="button"
              onClick={() => onAction?.(rec)}
              className="group mt-3 inline-flex items-center gap-1.5 text-[12px] font-bold text-cyan-300 hover:text-cyan-200 transition-colors"
            >
              {t(meta.ctaKey)}
              <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RecoveryRoadmap({ roadmap, isAnonymous = false, onRouteAction, onUnlock, className = "" }) {
  const { t } = useTranslation();
  if (!roadmap || roadmap.state === "insufficient_data") return null;

  // ── Top-tier (A/B) — no improvement routes, monitor-drift badge only.
  if (roadmap.state === "already_optimized") {
    return (
      <div
        className={`rounded-2xl p-5 ${className}`}
        style={{ background: "rgba(45,212,191,0.06)", border: "1px solid rgba(45,212,191,0.25)" }}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <ShieldCheck size={16} className="text-teal-300" />
          <span className="text-[14px] font-bold text-teal-200">{t("roadmap_toptier_title")}</span>
        </div>
        <p className="text-[12px] text-white/60 leading-snug">
          {t("roadmap_toptier_body")}
        </p>
      </div>
    );
  }

  // ── savings_opportunity — one figure + routes.
  const pool = roadmap.recoverable_annual || {};
  const recs = roadmap.recommendations || [];
  // Anonymous: first route teaser, rest locked.
  const visible = isAnonymous ? recs.slice(0, 1) : recs;
  const lockedCount = isAnonymous ? Math.max(0, recs.length - 1) : 0;

  return (
    <div
      className={`rounded-2xl p-5 md:p-6 ${className}`}
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.10)" }}
    >
      {/* THE ONE FIGURE — shown once, verbatim from the hero pool. */}
      <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-cyan-300/90 mb-1.5">{t("roadmap_recoverable")}</p>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span
          className="text-white font-black tabular-nums"
          style={{
            fontFamily: "'Space Grotesk', 'Inter', sans-serif",
            fontSize: "clamp(30px, 6vw, 44px)",
            letterSpacing: "-0.03em",
            lineHeight: 1,
          }}
        >
          {t("roadmap_up_to")} {eur(pool.point)}
        </span>
        <span className="text-[13px] text-white/50">{t("roadmap_per_year")}</span>
      </div>
      {isFinite(pool.lo) && isFinite(pool.hi) && (
        <p className="text-[12px] text-white/45 mt-1.5">
          {t("roadmap_range")} <span className="text-white/70 font-semibold tabular-nums">{eur(pool.lo)}–{eur(pool.hi)}</span>
        </p>
      )}

      {/* AMBITION — neutral upside, NO € attached, NO PSP name. */}
      {isFinite(roadmap.ambition_bps) && (
        <p className="text-[12px] text-white/55 mt-3 leading-snug">
          {t("roadmap_ambition", { x: (roadmap.ambition_bps / 100).toFixed(2) })}
        </p>
      )}

      {/* ROUTES — the HOW. */}
      <p className="text-[12px] font-bold text-white/70 mt-5 mb-2.5">{t("roadmap_routes")}</p>
      <div className="space-y-2.5">
        {visible.map((rec) => (
          <RouteRow key={rec.id} rec={rec} onAction={onRouteAction} />
        ))}

        {/* LOCKED overlay for anonymous — the rest of the plan behind signup. */}
        {lockedCount > 0 && (
          <button
            type="button"
            onClick={onUnlock}
            className="group w-full rounded-xl p-4 flex items-center gap-3 text-left transition-all hover:brightness-110"
            style={{
              background: "radial-gradient(120% 100% at 100% 0%, rgba(34,211,238,0.12) 0%, transparent 60%), rgba(255,255,255,0.03)",
              border: "1px solid rgba(34,211,238,0.25)",
            }}
          >
            <div
              className="shrink-0 inline-flex items-center justify-center h-9 w-9 rounded-lg"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
            >
              <Lock size={15} className="text-white/70" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-[14px]">
                {t(lockedCount === 1 ? "roadmap_locked_more_one" : "roadmap_locked_more_other", { n: lockedCount })}
              </p>
              <p className="text-[12px] text-white/55 mt-0.5">{t("roadmap_locked_sub")}</p>
            </div>
            <ArrowRight size={16} className="text-cyan-300 shrink-0 transition-transform group-hover:translate-x-0.5" />
          </button>
        )}
      </div>
    </div>
  );
}
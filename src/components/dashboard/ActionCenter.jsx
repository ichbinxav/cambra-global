// ActionCenter — "your next best step". ONE primary action, derived from the
// SAME aggregated state the Hero reads (computePaymentsNextAction). Title +
// one-line why (with a real € slice of engine_result.point) + a CTA that
// ALREADY exists + effort/impact chips. Secondaries are tiny links only.
//
// Renders NOTHING when there's no analysis (available:false) so it never shows
// an empty shell. Self-styles per tone: cyan for opportunity, emerald for the
// positive top-tier dead-end.
//
// The panel opens no modals itself — it calls the handlers the parent passes,
// which map to the existing flows (OAuth connect / CollectiveModal /
// BookCallModal / Analyzer). Single source, no new numbers, no double CTAs.

import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck, Users, PhoneCall, Plug, Layers, CheckCircle2, Zap } from "lucide-react";
import { useTranslation } from "@/lib/i18n.jsx";
import { derivePaymentsAccount } from "@/lib/paymentsAccount.js";
import { computePaymentsNextAction, NEXT_ACTION_INTENT } from "@/lib/paymentsNextAction.js";

const eur = (n, lang) => {
  const v = Math.max(0, Math.round(Number(n) || 0));
  const locale = { en: "en-IE", fr: "fr-FR", es: "es-ES" }[lang] || "en-IE";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
  } catch {
    return `€${v.toLocaleString()}`;
  }
};

const IMPACT_KEY = {
  verify: "ac_chip_impact_verify",
  recover: "ac_chip_impact_recover",
  protect: "ac_chip_impact_protect",
  complete: "ac_chip_impact_complete",
};

export default function ActionCenter({
  rows,               // AnalyzerResult rows (dashboard) — aggregated internally
  latest,             // latest AnalyzerResult (fallback + single-channel)
  inCollective = false,
  onVerify,
  onCall,
  onCollective,
  onAddChannel,
  compact = false,
}) {
  const { t, lang } = useTranslation();

  const action = useMemo(() => {
    const account = derivePaymentsAccount(Array.isArray(rows) ? rows : []);
    const latestRow = latest || (Array.isArray(rows) ? rows[0] : null);
    return computePaymentsNextAction(account, latestRow, { inCollective });
  }, [rows, latest, inCollective]);

  if (!action?.available) return null;

  const amount = eur(action.recoverable_eur, lang);
  const isPositive = action.tone === "positive";

  // Map the single intent → verbatim copy + icon + primary handler.
  let title, why, ctaLabel, onCta, Icon;
  switch (action.intent) {
    case NEXT_ACTION_INTENT.VERIFY_CONNECT:
      title = t("ac_verify_title");
      why = t("ac_verify_why", { amount });
      ctaLabel = t("ac_verify_cta");
      onCta = onVerify;
      Icon = ShieldCheck;
      break;
    case NEXT_ACTION_INTENT.BOOK_CALL:
      title = inCollective ? t("ac_incoll_title") : t("ac_call_title", { amount });
      why = inCollective ? t("ac_incoll_why", { amount }) : t("ac_call_why");
      ctaLabel = inCollective ? t("ac_incoll_cta") : t("ac_call_cta");
      onCta = onCall;
      Icon = PhoneCall;
      break;
    case NEXT_ACTION_INTENT.JOIN_COLLECTIVE:
      title = t("ac_recover_title", { amount });
      why = t("ac_recover_why_coll");
      ctaLabel = t("ac_recover_cta_coll");
      onCta = onCollective;
      Icon = Users;
      break;
    case NEXT_ACTION_INTENT.MONITOR_DRIFT:
    default:
      title = t("ac_toptier_title");
      why = t("ac_toptier_why");
      ctaLabel = null; // positive dead-end — no CTA button, badge only
      onCta = null;
      Icon = CheckCircle2;
      break;
  }

  const accent = isPositive ? "rgb(52,211,153)" : "rgb(34,211,238)";
  const impactKey = IMPACT_KEY[action.impact] || null;

  // Secondary link — only when the primary is the collective (offer a call) or
  // a call (offer the collective). Never on verify / add-channel / top-tier.
  const secondary =
    !compact && action.intent === NEXT_ACTION_INTENT.JOIN_COLLECTIVE
      ? { label: t("ac_secondary_call"), onClick: onCall }
      : !compact && action.intent === NEXT_ACTION_INTENT.BOOK_CALL && !inCollective
      ? { label: t("ac_secondary_coll"), onClick: onCollective }
      : null;

  return (
    <div
      className="relative rounded-2xl overflow-hidden"
      style={{
        background: isPositive
          ? "radial-gradient(120% 100% at 100% 0%, rgba(52,211,153,0.12) 0%, transparent 60%), rgba(255,255,255,0.03)"
          : "radial-gradient(120% 100% at 100% 0%, rgba(34,211,238,0.12) 0%, transparent 60%), rgba(255,255,255,0.03)",
        border: `1px solid ${isPositive ? "rgba(52,211,153,0.22)" : "rgba(34,211,238,0.22)"}`,
      }}
    >
      <div className={`relative z-10 ${compact ? "p-5" : "p-5 md:p-6"} flex flex-col md:flex-row md:items-center gap-4`}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <Icon size={14} style={{ color: accent }} />
            <span className="text-[10px] uppercase tracking-[0.22em] font-bold" style={{ color: accent, opacity: 0.9 }}>
              {t("ac_eyebrow")}
            </span>
          </div>
          <h3
            className="text-white font-black leading-tight"
            style={{ fontFamily: "'Space Grotesk','Inter',sans-serif", fontSize: compact ? 18 : 20, letterSpacing: "-0.02em" }}
          >
            {title}
          </h3>
          <p className="text-[13px] text-white/60 mt-1.5 leading-snug">{why}</p>

          {/* Chips — effort + impact (or the top-tier "efficient" badge) */}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {isPositive ? (
              <span
                className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] font-bold px-2.5 py-1 rounded-full"
                style={{ background: "rgba(52,211,153,0.14)", color: "rgb(52,211,153)", border: "1px solid rgba(52,211,153,0.35)" }}
              >
                <Zap size={10} /> {t("ac_toptier_badge")}
              </span>
            ) : (
              <>
                <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] font-bold px-2.5 py-1 rounded-full text-white/55" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}>
                  {t("ac_chip_effort_low")}
                </span>
                {impactKey && (
                  <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] font-bold px-2.5 py-1 rounded-full" style={{ background: "rgba(34,211,238,0.12)", color: "rgb(34,211,238)", border: "1px solid rgba(34,211,238,0.30)" }}>
                    {t(impactKey)}
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        {ctaLabel && (
          <div className="shrink-0 flex flex-col items-stretch md:items-end gap-2">
            <button
              onClick={onCta}
              className="h-11 rounded-full px-6 text-sm font-bold gap-2 text-white hover:opacity-90 inline-flex items-center justify-center transition-opacity"
              style={{
                background: "linear-gradient(135deg, #1F4ED8 0%, #2CA7C1 100%)",
                boxShadow: "0 0 32px rgba(34,211,238,0.32), 0 12px 32px -12px rgba(34,211,238,0.5)",
              }}
            >
              {action.intent === NEXT_ACTION_INTENT.VERIFY_CONNECT && <Plug size={15} />}
              {ctaLabel} <ArrowRight className="h-4 w-4" />
            </button>
            {secondary && (
              <button
                type="button"
                onClick={secondary.onClick}
                className="text-[12px] text-white/45 hover:text-cyan-200 underline underline-offset-2 transition-colors text-center md:text-right"
              >
                {secondary.label}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
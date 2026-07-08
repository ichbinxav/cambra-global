import { CheckCircle2, Sparkles } from "lucide-react";
import { useTranslation } from "@/lib/i18n.jsx";

/**
 * VerticalConfidenceLine — the small inline label next to each vertical
 * card's title on Results.jsx. Reflects THIS vertical's verification state.
 *
 *   • verified + high         → emerald "Verified · Stripe"
 *   • verified + provisional  → blue    "Verified · partial data"
 *   • estimated               → amber   "Estimated"
 *
 * Uses the same rounded-full pill visual that lives elsewhere on the page.
 * No new design; just reflects the state that's already computed upstream
 * by `getVerificationStatus(...)`.
 *
 * Props:
 *   vertical   — "payments" | "shipping" | "saas"
 *   info       — { status, confidence, source }  from verification.verticals[vertical]
 */

const FALLBACK = {
  vconf_verified_stripe: {
    en: "Verified · Stripe",
    fr: "Vérifié · Stripe",
    es: "Verificado · Stripe",
  },
  vconf_verified_partial: {
    en: "Verified · partial data",
    fr: "Vérifié · données partielles",
    es: "Verificado · datos parciales",
  },
};

function txt(t, lang, key) {
  const v = t(key);
  if (v === key && FALLBACK[key]) return FALLBACK[key][lang] || FALLBACK[key].en;
  return v;
}

export default function VerticalConfidenceLine({ info }) {
  const { t, lang } = useTranslation();
  if (!info) return null;

  if (info.status === "verified") {
    // High confidence + Stripe source → the emerald "Verified · Stripe" pill.
    if (info.confidence === "high" && info.source === "stripe") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold bg-emerald-500/10 text-emerald-600 border-emerald-500/25 whitespace-nowrap">
          <CheckCircle2 size={9} />
          {txt(t, lang, "vconf_verified_stripe")}
        </span>
      );
    }
    // Provisional (any source) → blue "Verified · partial data".
    if (info.confidence === "provisional") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold bg-blue-500/10 text-blue-600 border-blue-500/25 whitespace-nowrap">
          <Sparkles size={9} />
          {txt(t, lang, "vconf_verified_partial")}
        </span>
      );
    }
    // Verified but no confidence label (e.g. future non-Stripe bridge) →
    // generic emerald "Verified".
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold bg-emerald-500/10 text-emerald-600 border-emerald-500/25 whitespace-nowrap">
        <CheckCircle2 size={9} />
        {t("badge_verified")}
      </span>
    );
  }

  // Estimated
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold bg-amber-500/10 text-amber-600 border-amber-500/25 whitespace-nowrap">
      <span className="w-1 h-1 rounded-full bg-amber-500" />
      {t("badge_estimated")}
    </span>
  );
}
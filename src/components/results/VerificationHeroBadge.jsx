import { CheckCircle2, Sparkles, Zap } from "lucide-react";
import { useTranslation } from "@/lib/i18n.jsx";

/**
 * VerificationHeroBadge — the confidence pill at the top of the Results hero.
 *
 * Chunk 6, pure presentation. Reads a `verification` object produced by
 * `getVerificationStatus(...)` and renders ONE of four cases:
 *
 *   • overall === "verified" + data_confidence === "high"
 *       → emerald pill "Verified over your last 3 months"
 *
 *   • overall === "verified" + data_confidence === "provisional"
 *       → blue pill "Verified on partial data"
 *
 *   • overall === "mixed"
 *       → blue pill "Partially verified — {list of verified verticals}"
 *
 *   • overall === "estimated"
 *       → amber pill "Estimated"  (unchanged look from before)
 *
 * The pill visual language is IDENTICAL to what Results.jsx already used
 * (rounded-full, emerald/blue/amber, w-1.5 h-1.5 dot). No new design.
 *
 * Props:
 *   verification  — result of getVerificationStatus(analyzerResult, analyzerInput)
 */

/* Small inline copy fallback for the few new strings this file introduces.
   These are ALSO added to the main i18n dictionary — this fallback is only
   used if the key is somehow missing at runtime (defensive). */
const FALLBACK = {
  hero_verified_high: {
    en: "Verified over your last 3 months",
    fr: "Vérifié sur vos 3 derniers mois",
    es: "Verificado sobre tus últimos 3 meses",
  },
  hero_verified_provisional: {
    en: "Verified on partial data",
    fr: "Vérifié sur des données partielles",
    es: "Verificado sobre datos parciales",
  },
  hero_partially_verified: {
    en: "Partially verified — {verified} verified, {estimated} estimated",
    fr: "Partiellement vérifié — {verified} vérifié, {estimated} estimé",
    es: "Parcialmente verificado — {verified} verificado, {estimated} estimado",
  },
  vertical_payments: { en: "payments", fr: "paiements",  es: "pagos" },
  vertical_shipping: { en: "shipping", fr: "expédition", es: "envíos" },
  vertical_saas:     { en: "SaaS",     fr: "SaaS",       es: "SaaS" },
};

function txt(t, lang, key, params) {
  const v = t(key, params);
  if (v === key && FALLBACK[key]) {
    let s = FALLBACK[key][lang] || FALLBACK[key].en;
    if (params) {
      for (const [k, val] of Object.entries(params)) {
        s = s.replace(`{${k}}`, String(val));
      }
    }
    return s;
  }
  return v;
}

function verticalLabel(t, lang, vertical) {
  return txt(t, lang, `vertical_${vertical}`);
}

function joinVerticals(t, lang, arr) {
  if (!arr || arr.length === 0) return "";
  const labels = arr.map(v => verticalLabel(t, lang, v));
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} + ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} + ${labels[labels.length - 1]}`;
}

export default function VerificationHeroBadge({ verification }) {
  const { t, lang } = useTranslation();
  if (!verification) return null;

  const { overall, data_confidence, verified_verticals, estimated_verticals } = verification;

  // ── verified (all in scope, high confidence)
  if (overall === "verified" && data_confidence === "high") {
    return (
      <div className="inline-flex items-center gap-1.5 mb-5 px-3 py-1.5 rounded-full border text-[11px] font-bold bg-emerald-500/10 text-emerald-600 border-emerald-500/25">
        <CheckCircle2 size={11} />
        {txt(t, lang, "hero_verified_high")}
      </div>
    );
  }

  // ── verified (all in scope, provisional data)
  if (overall === "verified" && data_confidence === "provisional") {
    return (
      <div className="inline-flex items-center gap-1.5 mb-5 px-3 py-1.5 rounded-full border text-[11px] font-bold bg-blue-500/10 text-blue-600 border-blue-500/25">
        <Sparkles size={11} />
        {txt(t, lang, "hero_verified_provisional")}
      </div>
    );
  }

  // ── mixed — some verticals verified, some estimated
  if (overall === "mixed") {
    return (
      <div className="inline-flex items-center gap-1.5 mb-5 px-3 py-1.5 rounded-full border text-[11px] font-bold bg-blue-500/10 text-blue-600 border-blue-500/25">
        <Zap size={11} />
        {txt(t, lang, "hero_partially_verified", {
          verified:  joinVerticals(t, lang, verified_verticals),
          estimated: joinVerticals(t, lang, estimated_verticals),
        })}
      </div>
    );
  }

  // ── estimated (default)
  return (
    <div className="inline-flex items-center gap-1.5 mb-5 px-3 py-1.5 rounded-full border text-[11px] font-bold bg-amber-500/10 text-amber-600 border-amber-500/25">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
      {t("badge_estimated")}
    </div>
  );
}
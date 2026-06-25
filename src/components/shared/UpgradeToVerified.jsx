import { CheckCircle2, Sparkles, Plug, Upload } from "lucide-react";
import { useTranslation } from "@/lib/i18n.jsx";

/**
 * UpgradeToVerified — confidence + upgrade CTA per vertical.
 *
 * Props:
 *  - vertical: "payments" | "shipping" | "saas" | "banking"
 *  - currentConfidence: "estimated" | "connected" | "verified"
 *  - onConnect: function (optional)
 *  - isConnected: boolean
 *  - compact: boolean
 */

const VERTICAL_KEYS = {
  payments: {
    ctaKey: "uv_payments_cta", explainEstKey: "uv_payments_explain_est", explainVerKey: "uv_payments_explain_ver",
    icon: Plug,
  },
  shipping: {
    ctaKey: "uv_shipping_cta", explainEstKey: "uv_shipping_explain_est", explainVerKey: "uv_shipping_explain_ver",
    icon: Plug,
  },
  saas: {
    ctaKey: "uv_saas_cta", explainEstKey: "uv_saas_explain_est", explainVerKey: "uv_saas_explain_ver",
    icon: Upload,
  },
  banking: {
    ctaKey: "uv_banking_cta", explainEstKey: "uv_banking_explain_est", explainVerKey: "uv_banking_explain_ver",
    icon: Upload,
  },
};

/* Inline fallback copy — used because these strings aren't in the main flat dictionary.
   t() falls back to English when a key isn't found; we layer hard fallbacks below. */
const FALLBACK = {
  uv_payments_cta:           { en: "Connect Stripe", fr: "Connecter Stripe",     es: "Conectar Stripe" },
  uv_payments_explain_est:   { en: "Connect Stripe to verify your payment rate.",
                                fr: "Connectez Stripe pour vérifier votre taux de paiement.",
                                es: "Conecta Stripe para verificar tu tasa de pago." },
  uv_payments_explain_ver:   { en: "Verified with live Stripe data.",
                                fr: "Vérifié avec les données Stripe en direct.",
                                es: "Verificado con datos de Stripe en vivo." },
  uv_shipping_cta:           { en: "Connect carrier", fr: "Connecter le transporteur", es: "Conectar transportista" },
  uv_shipping_explain_est:   { en: "Add carrier data to verify shipping costs.",
                                fr: "Ajoutez les données du transporteur pour vérifier les coûts d'expédition.",
                                es: "Añade los datos del transportista para verificar los costes de envío." },
  uv_shipping_explain_ver:   { en: "Verified with carrier data.",
                                fr: "Vérifié avec les données du transporteur.",
                                es: "Verificado con datos del transportista." },
  uv_saas_cta:               { en: "Add data", fr: "Ajouter des données", es: "Añadir datos" },
  uv_saas_explain_est:       { en: "Add your software stack to verify SaaS costs.",
                                fr: "Ajoutez votre stack logicielle pour vérifier les coûts SaaS.",
                                es: "Añade tu stack de software para verificar los costes de SaaS." },
  uv_saas_explain_ver:       { en: "Verified with connected billing data.",
                                fr: "Vérifié avec les données de facturation connectées.",
                                es: "Verificado con datos de facturación conectados." },
  uv_banking_cta:            { en: "Add data", fr: "Ajouter des données", es: "Añadir datos" },
  uv_banking_explain_est:    { en: "Add banking statements to verify fees.",
                                fr: "Ajoutez vos relevés bancaires pour vérifier les frais.",
                                es: "Añade extractos bancarios para verificar las comisiones." },
  uv_banking_explain_ver:    { en: "Verified with bank data.",
                                fr: "Vérifié avec les données bancaires.",
                                es: "Verificado con datos bancarios." },
};

export default function UpgradeToVerified({
  vertical = "payments",
  currentConfidence = "estimated",
  onConnect,
  isConnected = false,
  compact = false,
}) {
  const { t, lang } = useTranslation();
  const cfg = VERTICAL_KEYS[vertical] || VERTICAL_KEYS.payments;
  const state = isConnected ? "verified" : currentConfidence;
  const Icon = cfg.icon;

  const txt = (key) => {
    const v = t(key);
    // If the dictionary returned the key itself (missing), use legacy fallback object
    if (v === key && FALLBACK[key]) return FALLBACK[key][lang] || FALLBACK[key].en;
    return v;
  };
  const ctaLabel       = txt(cfg.ctaKey);
  const explainEst     = txt(cfg.explainEstKey);
  const explainVer     = txt(cfg.explainVerKey);
  const labelVerified  = t("badge_verified");
  const labelEstimated = t("badge_estimated");
  const labelConnected = t("badge_connected");

  // Verified state — no CTA
  if (state === "verified" || state === "connected") {
    return (
      <div className={`inline-flex items-center gap-2 ${compact ? "text-[11px]" : "text-xs"}`}>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-bold bg-emerald-500/10 text-emerald-600 border-emerald-500/25`}>
          <CheckCircle2 size={compact ? 10 : 11} />
          {state === "verified" ? labelVerified : labelConnected}
        </span>
        {!compact && <span className="text-muted-foreground/70">{explainVer}</span>}
      </div>
    );
  }

  // Estimated state — show CTA
  if (compact) {
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold bg-amber-500/10 text-amber-600 border-amber-500/25">
          <Sparkles size={9} /> {labelEstimated}
        </span>
        <button
          onClick={onConnect}
          className="inline-flex items-center gap-1 h-7 px-3 rounded-full bg-foreground text-background text-[10px] font-bold hover:opacity-90 whitespace-nowrap"
        >
          <Icon size={9} /> {ctaLabel}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold bg-amber-500/10 text-amber-600 border-amber-500/25">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          {labelEstimated}
        </span>
        <span className="text-[11px] text-muted-foreground/70 leading-tight">{explainEst}</span>
      </div>
      <button
        onClick={onConnect}
        className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-full bg-foreground text-background text-xs font-bold hover:opacity-90 self-start min-h-[44px] sm:min-h-0"
      >
        <Icon size={11} /> {ctaLabel}
      </button>
    </div>
  );
}
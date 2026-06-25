import { CheckCircle2, Sparkles, Plug, Upload } from "lucide-react";

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

const VERTICAL_CONFIG = {
  payments: {
    cta: "Connect Stripe",
    explainEstimated: "Connect Stripe to verify your payment rate.",
    explainVerified: "Verified with live Stripe data.",
    icon: Plug,
  },
  shipping: {
    cta: "Connect carrier",
    explainEstimated: "Add carrier data to verify shipping costs.",
    explainVerified: "Verified with carrier data.",
    icon: Plug,
  },
  saas: {
    cta: "Add data",
    explainEstimated: "Add your software stack to verify SaaS costs.",
    explainVerified: "Verified with connected billing data.",
    icon: Upload,
  },
  banking: {
    cta: "Add data",
    explainEstimated: "Add banking statements to verify fees.",
    explainVerified: "Verified with bank data.",
    icon: Upload,
  },
};

function badgeFor(state) {
  if (state === "verified" || state === "connected") {
    return {
      label: state === "verified" ? "Verified" : "Connected",
      cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/25",
      dot: "bg-emerald-500",
    };
  }
  return {
    label: "Estimated",
    cls: "bg-amber-500/10 text-amber-600 border-amber-500/25",
    dot: "bg-amber-500",
  };
}

export default function UpgradeToVerified({
  vertical = "payments",
  currentConfidence = "estimated",
  onConnect,
  isConnected = false,
  compact = false,
}) {
  const cfg = VERTICAL_CONFIG[vertical] || VERTICAL_CONFIG.payments;
  const state = isConnected ? "verified" : currentConfidence;
  const badge = badgeFor(state);
  const Icon = cfg.icon;

  // Verified state — no CTA
  if (state === "verified" || state === "connected") {
    return (
      <div className={`inline-flex items-center gap-2 ${compact ? "text-[11px]" : "text-xs"}`}>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-bold ${badge.cls}`}>
          <CheckCircle2 size={compact ? 10 : 11} />
          Verified
        </span>
        {!compact && (
          <span className="text-muted-foreground/70">{cfg.explainVerified}</span>
        )}
      </div>
    );
  }

  // Estimated state — show CTA
  if (compact) {
    return (
      <div className="flex items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold ${badge.cls}`}>
          <Sparkles size={9} /> Estimated
        </span>
        <button
          onClick={onConnect}
          className="inline-flex items-center gap-1 h-7 px-3 rounded-full bg-foreground text-background text-[10px] font-bold hover:opacity-90 whitespace-nowrap"
        >
          <Icon size={9} /> {cfg.cta}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold ${badge.cls}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
          {badge.label}
        </span>
        <span className="text-[11px] text-muted-foreground/70 leading-tight">
          {cfg.explainEstimated}
        </span>
      </div>
      <button
        onClick={onConnect}
        className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-full bg-foreground text-background text-xs font-bold hover:opacity-90 self-start min-h-[44px] sm:min-h-0"
      >
        <Icon size={11} /> {cfg.cta}
      </button>
    </div>
  );
}
import { Lock, CreditCard, Truck, Package, Calendar, ArrowRight, Sparkles } from "lucide-react";
import { useTranslation } from "@/lib/i18n.jsx";

/**
 * RecommendedActionsLocked
 *
 * The "tease & lock" layer of the Results page.
 * Shows the user 3 concrete actions with TITLE + ESTIMATED SAVINGS visible,
 * but the actual HOW (provider, target rate, script, timing) blurred until
 * the user books a strategy call.
 *
 * Design rationale:
 *  - Proves we have the answer (not just the problem) → higher demo conversion.
 *  - Aligns with landing promise: free diagnostic, paid (or qualified) execution.
 *  - Single CTA at the bottom. No second-class "email me instead" path —
 *    that dilutes the qualification value of the call.
 *
 * Props:
 *  - paymentSavings, shippingSavings, saasSavings: annual EUR estimates
 *  - formatEur: locale-aware currency formatter
 *  - bookingUrl: where the CTA should send the user (defaults to /Contact)
 */
export default function RecommendedActionsLocked({
  paymentSavings = 0,
  shippingSavings = 0,
  saasSavings = 0,
  formatEur,
  bookingUrl = "/Contact",
}) {
  const { t } = useTranslation();

  // Build only actions with >0 savings, then keep top 3 by impact.
  const allActions = [
    {
      icon: CreditCard,
      category: t("payments_title") || "Payments",
      title: "Renegotiate your payment processor",
      savings: paymentSavings,
      // The blurred lines mimic the structure of a real playbook entry
      // so the user can FEEL the shape of what's behind the lock.
      blurred: [
        "Switch to ▇▇▇▇▇▇▇ for a target rate of ▇.▇▇%",
        "Use our ▇▇▇▇ negotiation script (24h response SLA)",
        "Estimated migration: ▇–▇ weeks · risk: low",
      ],
    },
    {
      icon: Truck,
      category: t("shipping_title") || "Shipping",
      title: "Re-bid your carrier contract",
      savings: shippingSavings,
      blurred: [
        "Target carrier mix: ▇▇▇▇▇ + ▇▇▇▇ for your volume",
        "Renegotiate ▇▇▇▇▇▇ surcharge & ▇▇▇▇▇▇▇ zones",
        "Estimated migration: ▇–▇ weeks · risk: low",
      ],
    },
    {
      icon: Package,
      category: t("saas_title") || "SaaS",
      title: "Consolidate your SaaS stack",
      savings: saasSavings,
      blurred: [
        "▇ tools to cancel · ▇ tools to merge into ▇▇▇▇▇▇▇",
        "Annual pre-pay leverage on ▇▇▇▇▇▇▇ (▇▇% discount)",
        "Estimated migration: ▇–▇ weeks · risk: low",
      ],
    },
  ];

  const actions = allActions
    .filter((a) => Number(a.savings) > 0)
    .sort((a, b) => b.savings - a.savings)
    .slice(0, 3);

  if (actions.length === 0) return null;

  const totalActionSavings = actions.reduce((s, a) => s + Number(a.savings || 0), 0);

  return (
    <section className="space-y-3">
      {/* Section header */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-1.5 mb-2 px-2.5 py-1 rounded-full border border-border/60 bg-secondary/40">
            <Sparkles size={10} className="text-foreground/70" />
            <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-muted-foreground">
              Recommended actions
            </span>
          </div>
          <h2 className="text-lg font-black tracking-tight">
            {actions.length} actions to recover{" "}
            <span className="tabular-nums">{formatEur(totalActionSavings)}</span>
            <span className="text-muted-foreground/50 font-normal text-sm">/yr</span>
          </h2>
          <p className="text-sm text-muted-foreground/70 mt-1">
            We've identified what to do. The exact playbook unlocks on the strategy call.
          </p>
        </div>
      </div>

      {/* Action cards */}
      <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
        <ul className="divide-y divide-border/40">
          {actions.map((a, idx) => {
            const Icon = a.icon;
            return (
              <li key={a.title} className="p-5 sm:p-6">
                <div className="flex items-start gap-4">
                  {/* Index + icon column */}
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[11px] font-mono text-muted-foreground/50 tabular-nums w-5">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <div className="w-9 h-9 rounded-xl bg-secondary border border-border/60 flex items-center justify-center">
                      <Icon size={14} className="text-foreground" />
                    </div>
                  </div>

                  {/* Content column */}
                  <div className="flex-1 min-w-0">
                    {/* Category + savings row */}
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <span className="text-[10px] uppercase tracking-[0.16em] font-bold text-muted-foreground/70">
                        {a.category}
                      </span>
                      <span className="text-sm font-black tabular-nums whitespace-nowrap">
                        {formatEur(a.savings)}
                        <span className="text-[10px] text-muted-foreground/50 font-normal ml-1">
                          /yr
                        </span>
                      </span>
                    </div>

                    {/* Title — visible */}
                    <p className="text-[15px] font-bold tracking-tight mb-3 leading-snug">
                      {a.title}
                    </p>

                    {/* Blurred playbook lines */}
                    <div
                      className="rounded-xl border border-dashed border-border/60 bg-secondary/30 p-3 space-y-1.5 relative overflow-hidden"
                      aria-label="Locked playbook details"
                    >
                      <div className="absolute top-2 right-2">
                        <Lock size={11} className="text-muted-foreground/50" />
                      </div>
                      {a.blurred.map((line, i) => (
                        <p
                          key={i}
                          className="text-[12px] text-muted-foreground/80 font-mono select-none"
                          style={{
                            filter: "blur(3.5px)",
                            userSelect: "none",
                          }}
                        >
                          {line}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {/* Unlock CTA — single, honest, ends the page's value arc */}
        <div className="p-5 sm:p-6 border-t border-border/40 bg-secondary/20">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-foreground text-background flex items-center justify-center shrink-0">
                <Lock size={14} />
              </div>
              <div>
                <p className="text-sm font-bold mb-0.5">
                  Unlock the full playbook
                </p>
                <p className="text-[12px] text-muted-foreground/80 leading-snug max-w-md">
                  20-min strategy call. We walk you through each action — providers, target rates, scripts, timing. Free, no commitment.
                </p>
              </div>
            </div>
            <a
              href={bookingUrl}
              className="inline-flex items-center justify-center gap-1.5 h-11 px-5 rounded-full bg-foreground text-background text-sm font-bold hover:opacity-90 transition-opacity shrink-0 min-h-[44px]"
            >
              <Calendar size={13} />
              Book strategy call
              <ArrowRight size={13} />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
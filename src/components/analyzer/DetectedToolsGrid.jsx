import React from "react";
import { Check, X, Globe, Database, Pencil } from "lucide-react";
import { useTranslation } from "@/lib/i18n.jsx";

/**
 * DetectedToolsGrid — Step 2: shows tools grouped by category with
 * confirm/dismiss toggles. CRITICAL: never renders Stripe-derived data or
 * payment-inferred monthly costs in this step (Stripe is connected later).
 *
 * Props:
 *   - tools, confirmed, dismissed, onToggle
 *   - discovering (bool): while true, render 4 shimmer placeholder cards
 *     (FIX 5). When it flips to false, real cards cross-fade in.
 */

const CATEGORY_ORDER = [
  { key: "payments",  label: "Payments",  matches: ["payment_provider", "payments"] },
  { key: "commerce",  label: "Commerce",  matches: ["commerce_platform", "commerce"] },
  { key: "shipping",  label: "Shipping",  matches: ["shipping", "logistics"] },
  { key: "marketing", label: "Marketing", matches: ["marketing", "analytics"] },
  { key: "saas",      label: "SaaS",      matches: ["saas_tool", "saas"] },
  { key: "banking",   label: "Banking",   matches: ["banking", "finance"] },
  { key: "support",   label: "Support",   matches: ["support"] },
  { key: "other",     label: "Other",     matches: ["other", "hr", "telecom"] },
];

function categoryFor(toolCategory) {
  const c = String(toolCategory || "").toLowerCase();
  for (const bucket of CATEGORY_ORDER) {
    if (bucket.matches.includes(c)) return bucket.key;
  }
  return "other";
}

function confidenceMeta(score) {
  const s = Number(score || 0);
  if (s >= 0.8) return { label: "High", color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" };
  if (s >= 0.5) return { label: "Medium", color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" };
  return { label: "Low", color: "text-muted-foreground", bg: "bg-secondary", border: "border-border/60" };
}

function sourceMeta(source) {
  const s = String(source || "").toLowerCase();
  if (s === "manual" || s === "user_added") {
    return { label: "Manual", Icon: Pencil };
  }
  if (s === "saved" || s === "memory" || s === "company_memory") {
    return { label: "Saved", Icon: Database };
  }
  return { label: "Website", Icon: Globe };
}

export default function DetectedToolsGrid({ tools, confirmed, dismissed, onToggle, discovering = false }) {
  const { t: i18n } = useTranslation();

  // FIX 5 — while discovery is running, show 4 shimmer placeholder cards.
  if (discovering) {
    return (
      <div
        className="space-y-2 transition-opacity duration-300"
        aria-busy="true"
        aria-live="polite"
      >
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            className="flex items-center gap-3 px-3 py-3 rounded-xl border border-border/60 bg-white min-h-[64px]"
          >
            <div className="flex-1 min-w-0 space-y-2">
              <div className="h-3 w-32 rounded shimmer" />
              <div className="h-2.5 w-20 rounded shimmer" />
            </div>
            <div className="w-11 h-11 rounded-full shimmer" />
            <div className="w-11 h-11 rounded-full shimmer" />
          </div>
        ))}
      </div>
    );
  }

  // Group tools by bucket
  const groups = {};
  for (const tool of tools) {
    const bucket = categoryFor(tool.category);
    if (!groups[bucket]) groups[bucket] = [];
    groups[bucket].push(tool);
  }

  const orderedBuckets = CATEGORY_ORDER.filter(b => groups[b.key]?.length);

  if (!orderedBuckets.length) {
    return (
      <div className="rounded-2xl border border-border/60 bg-secondary/30 p-6 text-center transition-opacity duration-300">
        <p className="text-sm font-semibold text-foreground">
          {i18n("discovery_empty")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 transition-opacity duration-300 opacity-100">
      {orderedBuckets.map(bucket => (
        <div key={bucket.key}>
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted-foreground/70 mb-2 px-1">
            {bucket.label}
          </p>
          <div className="space-y-2">
            {groups[bucket.key].map((t, i) => {
              const key = `${t.category}|${t.provider_or_tool}`;
              const isConfirmed = confirmed.has(key);
              const isDismissed = dismissed.has(key);
              const conf = confidenceMeta(t.confidence_score);
              const src = sourceMeta(t.source);
              const SrcIcon = src.Icon;

              return (
                <div
                  key={key + i}
                  className={`flex items-center gap-3 px-3 py-3 rounded-xl border transition-all min-h-[64px] ${
                    isConfirmed
                      ? "border-foreground/30 bg-white"
                      : isDismissed
                      ? "border-border/30 bg-secondary/40 opacity-60"
                      : "border-border/60 bg-white"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-foreground">{t.provider_or_tool}</p>
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-secondary border border-border/50 text-[10px] font-semibold text-muted-foreground">
                        <SrcIcon size={9} /> {src.label}
                      </span>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${conf.bg} ${conf.color} ${conf.border}`}>
                        {conf.label}
                      </span>
                    </div>
                  </div>

                  {/* FIX 19 — switch role with aria-checked + descriptive aria-label per tool */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isDismissed}
                    aria-label={`Dismiss ${t.provider_or_tool}`}
                    onClick={() => onToggle(key, "dismiss")}
                    className={`w-11 h-11 min-w-[44px] min-h-[44px] rounded-full border flex items-center justify-center transition-colors ${
                      isDismissed
                        ? "border-red-300 bg-red-50 text-red-600"
                        : "border-border/60 bg-white text-muted-foreground hover:border-red-300 hover:text-red-600"
                    }`}
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isConfirmed}
                    aria-label={`Confirm ${t.provider_or_tool}`}
                    onClick={() => onToggle(key, "confirm")}
                    className={`w-11 h-11 min-w-[44px] min-h-[44px] rounded-full border flex items-center justify-center transition-colors ${
                      isConfirmed
                        ? "border-emerald-400 bg-emerald-500 text-white"
                        : "border-border/60 bg-white text-muted-foreground hover:border-emerald-400 hover:text-emerald-600"
                    }`}
                  >
                    <Check size={16} aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
// AnalyzerEntryCards — the 3-way entry offered at the top of the Analyzer.
//
// Three ways to feed the engine, ordered by DATA QUALITY (best → fastest):
//   1. CONNECT      — Connect Stripe/PSP → real balance-transaction sync →
//                     "verified" mode (measured, not estimated). Requires
//                     signup. Routes to /ConnectTools.
//   2. UPLOAD       — Upload a provider statement (PDF/CSV). Not yet wired
//                     to the anonymous flow — surfaced as "coming soon" so
//                     the funnel doesn't lose users who want to click it.
//   3. MANUAL       — What the current Analyzer already is. Fastest, but
//                     the estimate carries the widest confidence band.
//
// UX contract: this component is presentational. It does NOT read or write
// any form state. Selection is owned by the parent (PaymentsAnalyzer) via
// `selected` + `onSelect(mode)`. When the user picks "manual" the parent
// keeps the existing form visible; when they pick "connect" the parent
// routes to /ConnectTools (protected route → login gate). "Upload" is
// disabled and shows a hint so we don't ship a broken action.
//
// Anti-pattern check: we deliberately DO NOT change the payload contract
// for submitPaymentsAnalysis. The three cards are choice UI on top of the
// same anonymous form; "connect" leaves the anonymous form for a
// different flow entirely (authenticated, real-data sync).

import { Zap, FileUp, Edit3, ArrowRight, Lock } from "lucide-react";

const CARDS = [
  {
    id: "connect",
    icon: Zap,
    title: "Connect your PSP",
    subtitle: "Verified real data",
    body: "Stripe OAuth in 20 seconds. We measure your actual fees over 90 days — no estimation.",
    accent: "cyan",
    badge: "Best accuracy",
    cta: "Connect Stripe",
    enabled: true,
  },
  {
    id: "upload",
    icon: FileUp,
    title: "Upload a statement",
    subtitle: "Invoice or CSV",
    body: "Drop a Stripe/PayPal/SumUp statement. We extract fees and pre-fill your report.",
    accent: "blue",
    badge: "Coming soon",
    cta: "Notify me",
    enabled: false,
  },
  {
    id: "manual",
    icon: Edit3,
    title: "Answer 5 questions",
    subtitle: "Fastest — no account",
    body: "Public pricing benchmark against merchants of your size + region. ~2 minutes.",
    accent: "neutral",
    badge: "You're here",
    cta: "Continue below",
    enabled: true,
  },
];

const ACCENT_STYLES = {
  cyan: {
    bg: "rgba(34,211,238,0.06)",
    border: "rgba(34,211,238,0.30)",
    borderSelected: "rgba(34,211,238,0.80)",
    text: "rgb(103,232,249)",
    glow: "0 0 24px rgba(34,211,238,0.25), 0 8px 24px -8px rgba(34,211,238,0.4)",
  },
  blue: {
    bg: "rgba(59,130,246,0.05)",
    border: "rgba(59,130,246,0.25)",
    borderSelected: "rgba(59,130,246,0.70)",
    text: "rgb(147,197,253)",
    glow: "0 0 24px rgba(59,130,246,0.22)",
  },
  neutral: {
    bg: "rgba(255,255,255,0.03)",
    border: "rgba(255,255,255,0.10)",
    borderSelected: "rgba(255,255,255,0.35)",
    text: "rgba(255,255,255,0.80)",
    glow: "0 8px 24px -8px rgba(0,0,0,0.5)",
  },
};

export default function AnalyzerEntryCards({ selected = "manual", onSelect }) {
  return (
    <div className="mb-8">
      <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-white/45 mb-3">
        Choose how to run your audit
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {CARDS.map((card) => {
          const Icon = card.icon;
          const accent = ACCENT_STYLES[card.accent];
          const isSelected = selected === card.id;
          const isDisabled = !card.enabled;
          return (
            <button
              key={card.id}
              type="button"
              disabled={isDisabled}
              onClick={() => card.enabled && onSelect?.(card.id)}
              className={`relative text-left rounded-2xl p-4 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 ${
                isDisabled ? "cursor-not-allowed opacity-60" : "hover:scale-[1.01]"
              }`}
              style={{
                background: accent.bg,
                border: `1px solid ${isSelected ? accent.borderSelected : accent.border}`,
                boxShadow: isSelected ? accent.glow : "none",
              }}
              aria-pressed={isSelected}
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div
                  className="inline-flex items-center justify-center h-9 w-9 rounded-lg shrink-0"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    color: accent.text,
                  }}
                >
                  <Icon size={16} strokeWidth={1.8} />
                </div>
                <span
                  className="text-[9px] uppercase tracking-[0.14em] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 shrink-0"
                  style={{
                    background: isDisabled ? "rgba(255,255,255,0.05)" : `rgba(255,255,255,0.05)`,
                    color: isDisabled ? "rgba(255,255,255,0.45)" : accent.text,
                    border: `1px solid ${isDisabled ? "rgba(255,255,255,0.12)" : accent.border}`,
                  }}
                >
                  {isDisabled && <Lock size={8} />}
                  {card.badge}
                </span>
              </div>
              <h3 className="text-white text-[15px] font-bold leading-tight mb-1"
                style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif", letterSpacing: "-0.02em" }}
              >
                {card.title}
              </h3>
              <p className="text-[11px] uppercase tracking-[0.12em] font-bold mb-2" style={{ color: accent.text }}>
                {card.subtitle}
              </p>
              <p className="text-[12px] text-white/60 leading-relaxed mb-3">
                {card.body}
              </p>
              <span
                className="inline-flex items-center gap-1 text-[11px] font-bold"
                style={{ color: isDisabled ? "rgba(255,255,255,0.4)" : accent.text }}
              >
                {card.cta}
                {!isDisabled && <ArrowRight size={11} />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
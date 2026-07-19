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
    // Fallback universal de facturas (FASE B) — the Upload path is now REAL
    // per-PSP: after picking a provider below, any non-Stripe PSP shows an
    // "Upload your last 3 statements" card (in beta). This entry card scrolls
    // the user to the provider selector where that option lives. Honest copy —
    // "in beta", not a promise of an instant verified number.
    id: "upload",
    icon: FileUp,
    title: "Upload your statements",
    subtitle: "Verified — in beta",
    body: "Pick your provider below, then drop your last statements. We start turning your estimate into a verified number.",
    accent: "blue",
    badge: "In beta",
    cta: "Choose provider",
    enabled: true,
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
    bg: "rgba(91,76,245,0.05)",
    border: "rgba(91,76,245,0.28)",
    borderSelected: "rgba(91,76,245,0.75)",
    text: "#5B4CF5",
    glow: "0 0 24px rgba(91,76,245,0.18), 0 8px 24px -8px rgba(91,76,245,0.32)",
  },
  blue: {
    bg: "rgba(91,76,245,0.04)",
    border: "rgba(91,76,245,0.22)",
    borderSelected: "rgba(91,76,245,0.6)",
    text: "#5A49D6",
    glow: "0 0 24px rgba(91,76,245,0.16)",
  },
  neutral: {
    bg: "#ffffff",
    border: "var(--linea)",
    borderSelected: "rgba(12,12,22,0.35)",
    text: "var(--gris-1)",
    glow: "0 8px 24px -12px rgba(12,12,22,0.15)",
  },
};

export default function AnalyzerEntryCards({ selected = "manual", onSelect }) {
  return (
    <div className="mb-8">
      <p className="text-[10px] uppercase tracking-[0.22em] font-bold mb-3" style={{ color: "var(--gris-1)" }}>
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
              className={`relative text-left rounded-2xl p-4 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5B4CF5]/40 ${
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
                    background: "rgba(12,12,22,0.03)",
                    border: "1px solid var(--linea)",
                    color: accent.text,
                  }}
                >
                  <Icon size={16} strokeWidth={1.8} />
                </div>
                <span
                  className="text-[9px] uppercase tracking-[0.14em] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 shrink-0"
                  style={{
                    background: "rgba(12,12,22,0.03)",
                    color: isDisabled ? "var(--gris-2)" : accent.text,
                    border: `1px solid ${isDisabled ? "var(--linea)" : accent.border}`,
                  }}
                >
                  {isDisabled && <Lock size={8} />}
                  {card.badge}
                </span>
              </div>
              <h3 className="text-[15px] font-bold leading-tight mb-1"
                style={{ color: "var(--ink)", fontFamily: "'Space Grotesk', 'Inter', sans-serif", letterSpacing: "-0.02em" }}
              >
                {card.title}
              </h3>
              <p className="text-[11px] uppercase tracking-[0.12em] font-bold mb-2" style={{ color: accent.text }}>
                {card.subtitle}
              </p>
              <p className="text-[12px] leading-relaxed mb-3" style={{ color: "var(--gris-1)" }}>
                {card.body}
              </p>
              <span
                className="inline-flex items-center gap-1 text-[11px] font-bold"
                style={{ color: isDisabled ? "var(--gris-2)" : accent.text }}
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
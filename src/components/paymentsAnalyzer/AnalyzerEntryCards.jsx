// AnalyzerEntryCards — the 3-way entry offered at the top of the Analyzer.
//
// Three ways to feed the engine, ordered by DATA QUALITY (best → fastest):
//   1. CONNECT      — Connect Stripe/PSP → real balance-transaction sync →
//                     "verified" mode (measured, not estimated). Requires
//                     signup. Routes to /ConnectTools.
//   2. UPLOAD       — Upload a provider statement (PDF/CSV). Scrolls to the
//                     per-PSP upload card below (in beta).
//   3. MANUAL       — What the current Analyzer already is. Fastest, but
//                     the estimate carries the widest confidence band.
//
// UX contract: this component is presentational. It does NOT read or write
// any form state. Selection is owned by the parent (PaymentsAnalyzer) via
// `selected` + `onSelect(mode)`.
//
// v2 (WOW-tech): the "connect" card is now a hero navy-gradient tile with a
// voltio glow + animated dot-mesh, the other two are premium paper cards with
// a hover glow halo. Entrance is staggered via framer-motion. Presentation
// only — the payload contract for submitPaymentsAnalysis is untouched.

import { Zap, FileUp, Edit3, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

const CARDS = [
  {
    id: "connect",
    icon: Zap,
    title: "Connect your PSP",
    subtitle: "Verified real data",
    body: "Stripe OAuth in 20 seconds. We measure your actual fees over 90 days — no estimation.",
    badge: "Best accuracy",
    cta: "Connect Stripe",
    featured: true,
  },
  {
    id: "upload",
    icon: FileUp,
    title: "Upload your statements",
    subtitle: "Independently extracted — beta",
    body: "Pick your provider below and upload a statement. We extract the figures with two independent readers; financial verification remains a separate review.",
    badge: "In beta",
    cta: "Choose provider",
  },
  {
    id: "manual",
    icon: Edit3,
    title: "Answer 5 questions",
    subtitle: "Fastest — no account",
    body: "We compare you with similar businesses in your region, using public prices. ~2 minutes.",
    badge: "You're here",
    cta: "Continue below",
  },
];

// ── Featured (navy hero) card — Connect PSP ──────────────────────────────
function FeaturedCard({ card, isSelected, onSelect }) {
  const Icon = card.icon;
  return (
    <motion.button
      type="button"
      onClick={() => onSelect?.(card.id)}
      whileHover={{ y: -3 }}
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
      className="group relative overflow-hidden text-left rounded-2xl p-4 h-full flex flex-col focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B7BFF]/50"
      style={{
        background:
          "radial-gradient(130% 90% at 8% 0%, rgba(91,76,245,0.45) 0%, transparent 55%)," +
          "radial-gradient(120% 100% at 100% 100%, rgba(57,198,240,0.22) 0%, transparent 60%)," +
          "linear-gradient(180deg, #191540 0%, #0e0b22 55%, #0a0818 100%)",
        border: `1px solid ${isSelected ? "rgba(139,123,255,0.7)" : "rgba(255,255,255,0.12)"}`,
        boxShadow: isSelected
          ? "0 0 0 3px rgba(139,123,255,0.18), 0 0 40px rgba(91,76,245,0.5), 0 20px 50px -20px rgba(91,76,245,0.6)"
          : "0 0 32px rgba(91,76,245,0.28), 0 18px 44px -22px rgba(91,76,245,0.5)",
      }}
      aria-pressed={isSelected}
    >
      {/* Animated dot-mesh */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.14) 1px, transparent 1.6px)",
          backgroundSize: "22px 22px",
          maskImage: "radial-gradient(ellipse 80% 80% at 100% 100%, #000 5%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 80% at 100% 100%, #000 5%, transparent 70%)",
          opacity: 0.7,
        }}
      />
      {/* Drifting cyan bloom */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-16 -right-10 h-48 w-48 rounded-full blur-2xl transition-opacity duration-500 opacity-60 group-hover:opacity-100"
        style={{ background: "radial-gradient(closest-side, rgba(57,198,240,0.35), transparent 70%)" }}
      />

      <div className="relative z-10 flex flex-col h-full">
        <div className="flex items-start justify-between gap-2 mb-3">
          <span
            className="inline-flex items-center justify-center h-9 w-9 rounded-lg shrink-0"
            style={{
              background: "linear-gradient(135deg, var(--voltio), var(--voltio-2))",
              boxShadow: "0 6px 18px -4px rgba(91,76,245,0.7)",
              color: "#ffffff",
            }}
          >
            <Icon size={16} strokeWidth={2} />
          </span>
          <span
            className="text-[9px] uppercase tracking-[0.16em] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 shrink-0"
            style={{ background: "rgba(139,123,255,0.2)", color: "#C9C1FF", border: "1px solid rgba(139,123,255,0.4)" }}
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style={{ background: "var(--voltio-2)" }} />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: "var(--voltio-2)" }} />
            </span>
            {card.badge}
          </span>
        </div>
        <h3 className="text-[15px] font-bold leading-tight mb-1"
          style={{ color: "#ffffff", fontFamily: "'Space Grotesk', 'Inter', sans-serif", letterSpacing: "-0.02em" }}
        >
          {card.title}
        </h3>
        <p className="text-[10px] uppercase tracking-[0.12em] font-bold mb-2" style={{ color: "var(--voltio-2)" }}>
          {card.subtitle}
        </p>
        <p className="text-[12px] leading-snug mb-3 flex-1" style={{ color: "rgba(255,255,255,0.72)" }}>
          {card.body}
        </p>
        <span
          className="inline-flex items-center gap-1.5 text-[12px] font-bold px-3 py-1.5 rounded-full transition-all group-hover:gap-2.5 w-fit"
          style={{ background: "linear-gradient(135deg, var(--voltio), var(--voltio-2))", color: "#ffffff", boxShadow: "0 6px 16px -6px rgba(91,76,245,0.7)" }}
        >
          {card.cta}
          <ArrowRight size={12} />
        </span>
      </div>
    </motion.button>
  );
}

// ── Standard (navy) card — Upload / Manual ──────────────────────────────
// Same navy-gradient background as the Connect card, but a FLAT (non-gradient)
// CTA pill so only "Connect PSP" carries the voltio gradient CTA.
function StandardCard({ card, isSelected, onSelect }) {
  const Icon = card.icon;
  return (
    <motion.button
      type="button"
      onClick={() => onSelect?.(card.id)}
      whileHover={{ y: -3 }}
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
      className="group relative overflow-hidden text-left rounded-2xl p-4 h-full flex flex-col focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B7BFF]/50"
      style={{
        background:
          "radial-gradient(130% 90% at 8% 0%, rgba(91,76,245,0.45) 0%, transparent 55%)," +
          "radial-gradient(120% 100% at 100% 100%, rgba(57,198,240,0.22) 0%, transparent 60%)," +
          "linear-gradient(180deg, #191540 0%, #0e0b22 55%, #0a0818 100%)",
        border: `1px solid ${isSelected ? "rgba(139,123,255,0.7)" : "rgba(255,255,255,0.12)"}`,
        boxShadow: isSelected
          ? "0 0 0 3px rgba(139,123,255,0.18), 0 0 40px rgba(91,76,245,0.5), 0 20px 50px -20px rgba(91,76,245,0.6)"
          : "0 0 32px rgba(91,76,245,0.28), 0 18px 44px -22px rgba(91,76,245,0.5)",
      }}
      aria-pressed={isSelected}
    >
      {/* Animated dot-mesh */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.14) 1px, transparent 1.6px)",
          backgroundSize: "22px 22px",
          maskImage: "radial-gradient(ellipse 80% 80% at 100% 100%, #000 5%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 80% at 100% 100%, #000 5%, transparent 70%)",
          opacity: 0.7,
        }}
      />
      {/* Drifting cyan bloom */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-16 -right-10 h-48 w-48 rounded-full blur-2xl transition-opacity duration-500 opacity-60 group-hover:opacity-100"
        style={{ background: "radial-gradient(closest-side, rgba(57,198,240,0.35), transparent 70%)" }}
      />
      <div className="relative z-10 flex flex-col h-full">
        <div className="flex items-start justify-between gap-2 mb-3">
          <span
            className="inline-flex items-center justify-center h-9 w-9 rounded-lg shrink-0"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)", color: "var(--voltio-2)" }}
          >
            <Icon size={16} strokeWidth={1.9} />
          </span>
          <span
            className="text-[9px] uppercase tracking-[0.16em] font-bold px-2 py-0.5 rounded-full shrink-0"
            style={{ background: "rgba(139,123,255,0.14) ", color: "#C9C1FF", border: "1px solid rgba(139,123,255,0.3)" }}
          >
            {card.badge}
          </span>
        </div>
        <h3 className="text-[15px] font-bold leading-tight mb-1"
          style={{ color: "#ffffff", fontFamily: "'Space Grotesk', 'Inter', sans-serif", letterSpacing: "-0.02em" }}
        >
          {card.title}
        </h3>
        <p className="text-[10px] uppercase tracking-[0.12em] font-bold mb-2" style={{ color: "var(--voltio-2)" }}>
          {card.subtitle}
        </p>
        <p className="text-[12px] leading-snug mb-3 flex-1" style={{ color: "rgba(255,255,255,0.72)" }}>
          {card.body}
        </p>
        {/* Flat CTA pill — no gradient (only the Connect card gets the voltio gradient) */}
        <span
          className="inline-flex items-center gap-1.5 text-[12px] font-bold px-3 py-1.5 rounded-full transition-all group-hover:gap-2.5 w-fit"
          style={{ background: "rgba(255,255,255,0.08)", color: "#ffffff", border: "1px solid rgba(255,255,255,0.16)" }}
        >
          {card.cta}
          <ArrowRight size={12} />
        </span>
      </div>
    </motion.button>
  );
}

export default function AnalyzerEntryCards({ selected = "manual", onSelect }) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3.5">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1"
          style={{ background: "var(--g-voltio)", boxShadow: "0 4px 14px -6px rgba(91,76,245,0.6)" }}
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style={{ background: "#ffffff" }} />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: "#ffffff" }} />
          </span>
          <span className="text-[9px] uppercase tracking-[0.22em] font-bold" style={{ color: "#ffffff" }}>
            Choose how to run your audit
          </span>
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 items-stretch">
        {CARDS.map((card, i) => (
          <motion.div
            key={card.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="h-full"
          >
            {card.featured ? (
              <FeaturedCard card={card} isSelected={selected === card.id} onSelect={onSelect} />
            ) : (
              <StandardCard card={card} isSelected={selected === card.id} onSelect={onSelect} />
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

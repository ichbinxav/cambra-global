import { useEffect, useMemo, useState } from "react";
import { Lightbulb, X } from "lucide-react";

/**
 * AnalyzerGuide — ambient, low-intensity guide card that lives in the
 * bottom-LEFT corner of the Analyzer (opposite the DetectionPopup which
 * lives bottom-right). Picks ONE message based on deterministic rules
 * over the analyzer state — no LLM, no async, no flicker.
 *
 * Why bottom-left: separates "ongoing coaching" (this) from "punctual
 * notification with CTA" (DetectionPopup) so they don't fight visually.
 *
 * Props:
 *   - step:              current step (1 | 2 | 3)
 *   - discoveryStatus:   'idle' | 'running' | 'completed' | 'failed'
 *   - detectedCount:     number of tools auto-detected
 *   - confirmedCount:    number of tools the user has confirmed
 *   - stripeConnected:   bool — Stripe OAuth status
 *   - revenueEur:        monthly revenue from the slider
 */
export default function AnalyzerGuide({
  step,
  discoveryStatus,
  detectedCount = 0,
  confirmedCount = 0,
  stripeConnected = false,
  revenueEur = 0,
}) {
  // Rule-based message picker — first match wins. Returns null if nothing
  // relevant to say, so the card hides itself.
  //
  // Three-step flow (minimum-friction redesign):
  //   step 1 → Brand (with live website discovery)
  //   step 2 → Stack (tool picker only — single task)
  //   step 3 → Result preview + optional refinement (Connect / Upload / Manual)
  const message = useMemo(() => {
    // ─── Step 1 — Brand & discovery ──────────────────────────────────────
    if (step === 1 && discoveryStatus === "idle") {
      return {
        id: "s1-idle",
        title: "Start with your website",
        body: "We'll scan your site for payment, shipping & SaaS signals automatically — no logins needed.",
      };
    }
    if (step === 1 && discoveryStatus === "running") {
      return {
        id: "s1-running",
        title: "Scanning your site…",
        body: "Looking for public infrastructure signals. This takes a few seconds.",
      };
    }
    if (step === 1 && discoveryStatus === "completed" && detectedCount > 0) {
      return {
        id: "s1-detected",
        title: `${detectedCount} tool${detectedCount === 1 ? "" : "s"} detected`,
        body: "Continue to confirm them, add anything we missed, and optionally verify your rates.",
      };
    }
    if (step === 1 && discoveryStatus === "completed" && detectedCount === 0) {
      return {
        id: "s1-empty",
        title: "No public signals found",
        body: "That's fine — you'll pick your stack manually in the next step. Takes ~1 minute.",
      };
    }
    if (step === 1 && discoveryStatus === "failed") {
      return {
        id: "s1-failed",
        title: "We couldn't scan automatically",
        body: "No problem — you'll pick your tools manually in the next step. The audit still works.",
      };
    }

    // ─── Step 2 — Stack (one task: confirm the tool list) ───────────────
    // "Typical stack" benchmark by revenue tier (qualitative, not numeric).
    const expectedStackSize =
      revenueEur < 10_000 ? 4 :
      revenueEur < 50_000 ? 7 :
      revenueEur < 200_000 ? 10 : 14;

    if (step === 2 && confirmedCount === 0) {
      return {
        id: "s2-empty",
        title: "Confirm the tools you use",
        body: "Detected ones are pre-selected. Tap to add anything we missed — banking, SaaS, marketing.",
      };
    }
    if (step === 2 && confirmedCount < expectedStackSize) {
      const missing = expectedStackSize - confirmedCount;
      return {
        id: "s2-thin",
        title: `${confirmedCount} selected — brands your size usually have ~${expectedStackSize}`,
        body: `Add about ${missing} more for a sharper number. Then tap "See my savings".`,
      };
    }
    if (step === 2 && confirmedCount >= expectedStackSize) {
      return {
        id: "s2-ready",
        title: "Stack looks complete",
        body: "Tap \"See my savings\" — you'll get your number right away, no connection required.",
      };
    }

    // ─── Step 3 — Result preview + optional refinement ──────────────────
    if (step === 3 && !stripeConnected) {
      return {
        id: "s3-refine",
        title: "Your estimated savings are ready",
        body: "Want the exact number? Connect Stripe or upload a statement below — fully optional.",
      };
    }
    if (step === 3 && stripeConnected) {
      return {
        id: "s3-verified",
        title: "Verified with Stripe",
        body: "Your payments figure is now sourced from live data. Open the full report when you're ready.",
      };
    }

    return null;
  }, [step, discoveryStatus, detectedCount, confirmedCount, stripeConnected, revenueEur]);

  // Per-message dismissal — once the user closes a message, it stays closed
  // until a different message would be shown.
  const [dismissedId, setDismissedId] = useState("");
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // Small entry delay so the card doesn't compete with page transitions.
    const t = setTimeout(() => setMounted(true), 400);
    return () => clearTimeout(t);
  }, []);

  if (!message || !mounted) return null;
  if (dismissedId === message.id) return null;

  return (
    <div
      role="complementary"
      aria-label="Analyzer guide"
      className="fixed z-[55] left-4 right-4 bottom-20 sm:left-6 sm:right-auto sm:bottom-24 sm:w-[320px]"
      style={{ animation: "cambra-guide-in 360ms cubic-bezier(0.16, 1, 0.3, 1)" }}
    >
      <div
        className="rounded-2xl p-3.5 relative"
        style={{
          background: "rgba(12,14,22,0.88)",
          border: "1px solid rgba(255,255,255,0.10)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          boxShadow: "0 18px 48px -18px rgba(0,0,0,0.6)",
        }}
      >
        <button
          type="button"
          onClick={() => setDismissedId(message.id)}
          aria-label="Dismiss tip"
          className="absolute top-2.5 right-2.5 text-white/35 hover:text-white p-0.5"
        >
          <X size={11} />
        </button>

        <div className="flex items-start gap-2.5 pr-4">
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5"
            style={{
              background: "rgba(250,204,21,0.12)",
              border: "1px solid rgba(250,204,21,0.32)",
            }}
            aria-hidden="true"
          >
            <Lightbulb size={11} className="text-yellow-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-yellow-300/80 mb-1">
              Guide
            </p>
            <p className="text-[13px] font-bold text-white leading-snug mb-1">
              {message.title}
            </p>
            <p className="text-[11.5px] text-white/60 leading-relaxed">
              {message.body}
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes cambra-guide-in {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
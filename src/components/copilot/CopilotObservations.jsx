import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, X } from "lucide-react";
import { useLocation } from "react-router-dom";

/**
 * CopilotObservations — proactive floating observations.
 *
 * Surfaces short, contextual intelligence whispers in the corner of the screen,
 * making the platform feel alive and agentic. Auto-rotates, dismissable.
 *
 * Sits ABOVE the Copilot floating pill (bottom-left), positioned right
 * so the two don't collide on desktop. On mobile it goes top-center under navbar.
 */

const OBSERVATIONS_BY_PATH = {
  "/": [
    "Scanning peer infrastructure benchmarks…",
    "Median PSP rate for €1–5M brands: 1.4%.",
    "Most brands operate 2.3× more SaaS tools than peers.",
    "Infrastructure drift compounds at ~6% / year.",
  ],
  "/Analyzer": [
    "Upload your PSP statement to sharpen benchmark.",
    "Each layer audited improves benchmark confidence.",
    "Brands at your tier typically reveal 4.2 inefficiencies.",
    "Estimated overpayment detected.",
  ],
  "/Dashboard": [
    "Benchmark confidence increased.",
    "New inefficiency detected in shipping layer.",
    "Your SaaS stack appears fragmented.",
    "3 providers benchmarked this week.",
  ],
  "/Results": [
    "Compiling peer-tier benchmark…",
    "Margin leakage isolated across 4 layers.",
    "Stripe fees above peer median.",
    "Activate a deal to recover detected drift.",
  ],
};

const DEFAULT_OBS = [
  "Continuous infrastructure intelligence · active.",
  "Benchmarking quietly in the background.",
  "Peer medians refreshed.",
];

const PATHS_WITH_OBS = ["/", "/Landing", "/Analyzer", "/Dashboard", "/Results"];

function pickObservations(pathname) {
  return OBSERVATIONS_BY_PATH[pathname] || OBSERVATIONS_BY_PATH["/" + pathname.split("/")[1]] || DEFAULT_OBS;
}

export default function CopilotObservations() {
  const location = useLocation();
  const [dismissed, setDismissed] = useState(false);
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(false);

  const observations = pickObservations(location.pathname);
  const isVisiblePath = PATHS_WITH_OBS.some(
    (p) => location.pathname === p || location.pathname.toLowerCase() === p.toLowerCase()
  );

  // Reset on path change
  useEffect(() => {
    setDismissed(false);
    setIdx(0);
    setVisible(false);
    const showT = setTimeout(() => setVisible(true), 1800);
    return () => clearTimeout(showT);
  }, [location.pathname]);

  // Rotate observations
  useEffect(() => {
    if (!visible || dismissed) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % observations.length), 5200);
    return () => clearInterval(t);
  }, [visible, dismissed, observations.length]);

  if (dismissed || !isVisiblePath || !visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 14, scale: 0.96 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className="fixed bottom-5 right-5 z-[85] max-w-[320px] hidden sm:block"
        role="status"
        aria-live="polite"
      >
        <div className="rounded-2xl border border-border/60 bg-card/95 backdrop-blur-xl shadow-[0_18px_50px_rgba(0,0,0,0.14)] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border/40 flex items-center justify-between bg-secondary/30">
            <div className="flex items-center gap-2">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cambra-mint opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cambra-mint" />
              </span>
              <span className="text-[9px] uppercase tracking-[0.22em] text-muted-foreground/70 font-mono">
                Intelligence Agent
              </span>
            </div>
            <button
              onClick={() => setDismissed(true)}
              className="text-muted-foreground/50 hover:text-foreground transition p-0.5"
              aria-label="Dismiss observation"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="p-4 flex items-start gap-3">
            <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-background shrink-0">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <AnimatePresence mode="wait">
              <motion.p
                key={idx}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.28 }}
                className="text-[13px] leading-snug text-foreground/90 font-medium"
              >
                {observations[idx]}
              </motion.p>
            </AnimatePresence>
          </div>

          {/* Tick progress */}
          <div className="h-0.5 bg-border/30 relative overflow-hidden">
            <motion.div
              key={idx}
              initial={{ x: "-100%" }}
              animate={{ x: "0%" }}
              transition={{ duration: 5.2, ease: "linear" }}
              className="absolute inset-0 bg-saas-gradient"
            />
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
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
    "2 redundant SaaS tools detected.",
    "Stripe fees above peer median.",
    "Drift detected · payments layer.",
    "FX exposure unbenchmarked.",
  ],
  "/Analyzer": [
    "0.6pp PSP delta likely.",
    "Each layer sharpens benchmark confidence.",
    "Upload one statement to lock numbers.",
  ],
  "/Dashboard": [
    "Drift detected · shipping layer.",
    "SaaS stack fragmented.",
    "Benchmark refreshed.",
  ],
  "/Results": [
    "Margin leakage isolated · 4 layers.",
    "PSP above peer median.",
    "Recoverable margin quantified.",
  ],
};

const DEFAULT_OBS = [
  "Drift scan · active.",
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

  // Show after delay, then auto-fade after a while to feel ambient
  useEffect(() => {
    setDismissed(false);
    setIdx(0);
    setVisible(false);
    const showT = setTimeout(() => setVisible(true), 3500);
    return () => clearTimeout(showT);
  }, [location.pathname]);

  // Rotate observations slowly
  useEffect(() => {
    if (!visible || dismissed) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % observations.length), 7000);
    return () => clearInterval(t);
  }, [visible, dismissed, observations.length]);

  if (dismissed || !isVisiblePath || !visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 0.92, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        whileHover={{ opacity: 1 }}
        className="fixed bottom-20 left-4 z-[85] max-w-[260px] hidden lg:block group"
        role="status"
        aria-live="polite"
      >
        <div className="relative flex items-center gap-2.5 px-3 py-2 rounded-full border border-border/40 bg-background/70 backdrop-blur-xl hover:bg-background/95 hover:border-border/70 transition-all">
          {/* Ambient pulse */}
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cambra-mint opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cambra-mint" />
          </span>

          {/* Rotating whisper */}
          <AnimatePresence mode="wait">
            <motion.p
              key={idx}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.32 }}
              className="text-[11px] font-mono text-foreground/70 leading-snug whitespace-nowrap"
            >
              {observations[idx]}
            </motion.p>
          </AnimatePresence>

          {/* Dismiss — only visible on hover */}
          <button
            onClick={() => setDismissed(true)}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/50 hover:text-foreground p-0.5 shrink-0"
            aria-label="Dismiss"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
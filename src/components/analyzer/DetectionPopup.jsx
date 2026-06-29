import { useEffect, useState } from "react";
import { Sparkles, X, ArrowRight } from "lucide-react";

/**
 * DetectionPopup — floating toast-style popup that announces auto-detected
 * tools after the discovery agent runs on the user's website.
 *
 * - Slides in from the bottom-right after a small delay.
 * - Shows up to 4 tool name chips + count of extras.
 * - Primary CTA "Connect" calls onConnect (the parent moves to next step
 *   or opens the connect mode).
 * - Dismissible. Auto-shows again only when `findings` changes to a fresh set.
 *
 * Props:
 *   - findings: Array<{ provider_or_tool: string }>
 *   - onConnect: () => void
 *   - onDismiss?: () => void
 */
export default function DetectionPopup({ findings = [], onConnect, onDismiss }) {
  const [visible, setVisible] = useState(false);
  const [dismissedKey, setDismissedKey] = useState("");

  const names = findings.map(f => f.provider_or_tool).filter(Boolean);
  const key = names.join("|");

  useEffect(() => {
    if (!key || key === dismissedKey) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), 250);
    return () => clearTimeout(timer);
  }, [key, dismissedKey]);

  if (!visible || names.length === 0) return null;

  const visibleChips = names.slice(0, 4);
  const remaining = names.length - visibleChips.length;

  const dismiss = () => {
    setVisible(false);
    setDismissedKey(key);
    onDismiss?.();
  };

  const connect = () => {
    setVisible(false);
    setDismissedKey(key);
    onConnect?.();
  };

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Tools detected on your website"
      className="fixed z-[60] left-4 right-4 bottom-20 sm:left-auto sm:right-6 sm:bottom-24 sm:w-[360px]"
      style={{ animation: "cambra-popup-in 320ms cubic-bezier(0.16, 1, 0.3, 1)" }}
    >
      <div
        className="rounded-2xl p-4 relative overflow-hidden"
        style={{
          background: "rgba(10,15,25,0.92)",
          border: "1px solid rgba(34,211,238,0.32)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          boxShadow: "0 24px 60px -18px rgba(0,0,0,0.65), 0 0 36px rgba(34,211,238,0.18)",
        }}
      >
        {/* Subtle radial glow */}
        <div
          aria-hidden="true"
          className="absolute -top-12 -right-10 w-40 h-40 pointer-events-none"
          style={{
            background: "radial-gradient(circle, rgba(34,211,238,0.28) 0%, transparent 70%)",
            filter: "blur(20px)",
          }}
        />

        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="absolute top-3 right-3 text-white/40 hover:text-white p-1"
        >
          <X size={13} />
        </button>

        <div className="flex items-center gap-2 mb-1.5">
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center"
            style={{
              background: "rgba(34,211,238,0.15)",
              border: "1px solid rgba(34,211,238,0.4)",
            }}
          >
            <Sparkles size={11} className="text-cyan-300" />
          </div>
          <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-cyan-300">
            Auto-detected
          </p>
        </div>

        <p className="text-sm font-bold text-white mb-3 pr-6">
          We found {names.length} tool{names.length === 1 ? "" : "s"} on your site
        </p>

        <div className="flex flex-wrap gap-1.5 mb-4">
          {visibleChips.map(name => (
            <span
              key={name}
              className="text-[11px] font-semibold text-white px-2.5 py-1 rounded-full"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
              }}
            >
              {name}
            </span>
          ))}
          {remaining > 0 && (
            <span className="text-[11px] font-semibold text-white/55 px-2.5 py-1">
              +{remaining} more
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={connect}
            className="flex-1 h-9 rounded-full text-xs font-bold inline-flex items-center justify-center gap-1.5 text-black hover:opacity-90 transition-opacity"
            style={{
              background: "linear-gradient(135deg, #ffffff 0%, #d1f5fb 100%)",
              boxShadow: "0 0 20px rgba(34,211,238,0.35)",
            }}
          >
            Connect <ArrowRight size={12} />
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="h-9 px-3 rounded-full text-xs font-medium text-white/60 hover:text-white transition-colors"
          >
            Later
          </button>
        </div>
      </div>

      <style>{`
        @keyframes cambra-popup-in {
          from { opacity: 0; transform: translateY(16px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
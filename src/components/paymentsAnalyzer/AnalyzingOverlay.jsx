import { useEffect, useState } from "react";
import { BRAND_ASSETS } from "@/lib/brandAssets";
import { useTranslation } from "@/lib/i18n.jsx";

/**
 * AnalyzingOverlay — shown while the payments audit runs (submitting=true).
 *
 * Cold start of the backend function can take up to ~8s on the first
 * invocation after inactivity; a static spinner reads as "hung". This overlay
 * advances a sequence of real work steps on a time schedule (so it never looks
 * frozen up to ~15s) — but the CLOSE is dictated by the real response: the
 * parent unmounts this component the moment the submit resolves. When the
 * function is warm (~400ms, the usual case) the user barely sees step 1 and
 * jumps straight to results. The artificial sequence never replaces the real
 * wait — it only fills a slow cold start.
 *
 * Pure presentation. No business logic, no data.
 */
/* I18N-GAP — step copy lives in the i18n dictionary; keys are resolved inside
   the component via t() so labels react to a language switch mid-session. */
const STEP_KEYS = ["overlay_step_1", "overlay_step_2", "overlay_step_3", "overlay_step_4"];

// Cadence: advance a step roughly every 3.5s so all 4 steps span ~14s before
// the last one holds. Progress bar eases toward 92% and never claims 100%
// until the real response closes the overlay.
const STEP_MS = 3500;

export default function AnalyzingOverlay() {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [pct, setPct] = useState(8);

  useEffect(() => {
    const stepTimer = setInterval(() => {
      setStep((s) => Math.min(s + 1, STEP_KEYS.length - 1));
    }, STEP_MS);
    // Progress creeps toward 92% asymptotically so it always feels alive but
    // never completes on its own — the real response completes it.
    const pctTimer = setInterval(() => {
      setPct((p) => (p >= 92 ? 92 : p + Math.max(1, Math.round((92 - p) / 12))));
    }, 400);
    return () => {
      clearInterval(stepTimer);
      clearInterval(pctTimer);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center px-6 text-center"
      style={{ background: "rgba(8,9,20,0.86)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
      role="status"
      aria-live="polite"
    >
      <img
        src={BRAND_ASSETS.flowFrosted}
        alt=""
        width={380}
        height={380}
        loading="lazy"
        className="hero-stack w-[62%] max-w-[340px] h-auto select-none"
        draggable={false}
      />

      <p
        className="mt-6 text-white font-black"
        style={{ fontFamily: "'Space Grotesk','Inter',sans-serif", fontSize: 20, letterSpacing: "-0.02em" }}
      >
        {t("overlay_title")}
      </p>

      {/* Progress bar */}
      <div className="mt-5 w-full max-w-xs h-[3px] rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${pct}%`,
            background: "linear-gradient(90deg, var(--voltio) 0%, #39C6F0 100%)",
            boxShadow: "0 0 12px rgba(91,76,245,0.55)",
          }}
        />
      </div>

      {/* Live steps */}
      <ul className="mt-6 space-y-2.5 text-left">
        {STEP_KEYS.map((k, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <li key={k} className="flex items-center gap-2.5 text-[13px] transition-colors">
              <span
                className="inline-flex items-center justify-center h-4 w-4 rounded-full shrink-0 transition-all"
                style={{
                  background: done
                    ? "linear-gradient(135deg, var(--voltio) 0%, #39C6F0 100%)"
                    : active
                      ? "rgba(91,76,245,0.15)"
                      : "rgba(255,255,255,0.06)",
                  border: active ? "1px solid rgba(91,76,245,0.6)" : "1px solid transparent",
                }}
              >
                {done ? (
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                    <path d="M1.5 5.2L4 7.5L8.5 2.5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : active ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 animate-pulse" />
                ) : null}
              </span>
              <span style={{ color: done ? "rgba(255,255,255,0.55)" : active ? "#ffffff" : "rgba(255,255,255,0.35)" }}>
                {t(k)}
                {active && <span className="inline-block ml-0.5 animate-pulse">…</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
import React, { useState } from "react";
import { ArrowRight, Check } from "lucide-react";

/**
 * JoinWaitlistButton — visual-only CTA for the "Join to recover" flow.
 *
 * MVP scope on purpose:
 *   - Renders a pill button "Join to recover".
 *   - On click, expands into a single email input.
 *   - On submit (valid email), shows "You're on the list — we'll be in touch".
 *   - No entity, no backend call, no aggregate demand counter yet.
 *     That waitlist infra is a separate feature, built after Stripe validation.
 *
 * Accepts `variant`:
 *   - "primary" (default) — white pill, blue text, glow (for prominent placements)
 *   - "ghost" — outlined pill for secondary contexts
 */
export default function JoinWaitlistButton({ variant = "primary", label = "Join to recover" }) {
  const [state, setState] = useState("idle"); // idle | form | done
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isValidEmail(email)) {
      setError("Enter a valid email");
      return;
    }
    setError("");
    // Visual-only: no backend call. Waitlist entity is a separate feature.
    setState("done");
  };

  if (state === "done") {
    return (
      <div
        className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-[14px] font-bold"
        style={{
          border: "1px solid rgba(34,211,238,0.35)",
          background: "rgba(34,211,238,0.08)",
          color: "#a5f3fc",
        }}
        role="status"
        aria-live="polite"
      >
        <Check size={14} className="text-cyan-300" />
        You're on the list — we'll be in touch.
      </div>
    );
  }

  if (state === "form") {
    return (
      <form
        onSubmit={handleSubmit}
        className="flex flex-col sm:flex-row items-stretch gap-2 max-w-md"
      >
        <input
          type="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@brand.com"
          className="flex-1 rounded-full px-5 py-3 text-[14px] text-white placeholder:text-white/40 outline-none"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: `1px solid ${error ? "rgba(239,68,68,0.45)" : "rgba(255,255,255,0.14)"}`,
          }}
          aria-label="Email address"
          aria-invalid={error ? "true" : "false"}
        />
        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-[14px] font-bold bg-white text-black hover:bg-white/90"
          style={{
            boxShadow:
              "0 0 0 1px rgba(255,255,255,0.1), 0 12px 32px -12px rgba(34,211,238,0.55)",
          }}
        >
          Join <ArrowRight size={14} />
        </button>
        {error && (
          <span className="text-[12px] text-red-300 sm:hidden">{error}</span>
        )}
      </form>
    );
  }

  // idle
  const commonStyle =
    variant === "primary"
      ? {
          background: "#ffffff",
          color: "#0a0f1e",
          boxShadow:
            "0 0 0 1px rgba(255,255,255,0.1), 0 12px 32px -12px rgba(34,211,238,0.55), 0 0 28px rgba(34,211,238,0.22)",
        }
      : {
          background: "transparent",
          color: "rgba(255,255,255,0.95)",
          border: "1px solid rgba(255,255,255,0.20)",
        };

  return (
    <button
      type="button"
      onClick={() => setState("form")}
      className="inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-[14px] font-bold transition-transform hover:scale-[1.02]"
      style={commonStyle}
    >
      {label}
      <ArrowRight size={14} />
    </button>
  );
}